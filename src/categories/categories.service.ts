import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { CategorySpecification } from '../entities/category-specification.entity';
import { Settings } from '../entities/settings.entity';
import { StorageService } from '../storage/storage.service';
import {
  canonicalizeSpecDisplayName,
  normalizeSpecName,
} from '../products/spec-filters.util';

export type CategorySpecInput = {
  id?: number;
  name: string;
  showInCategory?: boolean | string;
  order?: number;
  image?: string | null;
  removeImage?: boolean | string;
};

const SHOW_IN_CATEGORY_DEFAULT_MIGRATION = 'migration_show_in_category_default_v1';

@Injectable()
export class CategoriesService implements OnModuleInit {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(CategorySpecification)
    private categorySpecsRepository: Repository<CategorySpecification>,
    @InjectRepository(Settings)
    private settingsRepository: Repository<Settings>,
    private storageService: StorageService,
  ) {}

  async onModuleInit() {
    await this.ensureShowInCategoryDefaultEnabled();
  }

  /** Один раз включает показ всех характеристик в категориях (прод + локально). */
  private async ensureShowInCategoryDefaultEnabled() {
    const done = await this.settingsRepository.findOne({
      where: { key: SHOW_IN_CATEGORY_DEFAULT_MIGRATION },
    });
    if (done?.value === '1') {
      return;
    }

    const result = await this.categorySpecsRepository
      .createQueryBuilder()
      .update(CategorySpecification)
      .set({ showInCategory: true })
      .where('"showInCategory" = :flag', { flag: false })
      .execute();

    const flag = this.settingsRepository.create({
      key: SHOW_IN_CATEGORY_DEFAULT_MIGRATION,
      value: '1',
    });
    if (done) {
      done.value = '1';
      done.updatedAt = new Date();
      await this.settingsRepository.save(done);
    } else {
      await this.settingsRepository.save(flag);
    }

    this.logger.log(
      `Включён показ характеристик в категориях (обновлено: ${result.affected || 0})`,
    );
  }

  private async transformCategory(category: Category): Promise<Category> {
    if (!category) return category;

    if (category.image) {
      const url = await this.storageService.getFileUrl(category.image);
      if (url) {
        category.image = url;
      }
    }

    if (category.specifications?.length) {
      category.specifications.sort((a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id);
      category.specifications = await Promise.all(
        category.specifications.map(async (spec) => {
          if (spec.image) {
            const url = await this.storageService.getFileUrl(spec.image);
            if (url) {
              spec.image = url;
            }
          }
          return spec;
        }),
      );
    }

    return category;
  }

  private async backfillSpecsFromProducts(categoryId: number): Promise<void> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId },
      relations: ['products', 'products.specifications', 'specifications'],
    });
    if (!category) {
      return;
    }

    const existingKeys = new Set(
      (category.specifications || []).map((spec) => normalizeSpecName(spec.name || '')),
    );
    const maxOrder = (category.specifications || []).reduce(
      (max, spec) => Math.max(max, spec.order || 0),
      0,
    );
    let nextOrder = maxOrder;
    const toCreate: CategorySpecification[] = [];

    for (const product of category.products || []) {
      for (const spec of product.specifications || []) {
        const name = canonicalizeSpecDisplayName(spec.name || '');
        const key = normalizeSpecName(name);
        if (!name || !key || existingKeys.has(key)) {
          continue;
        }
        existingKeys.add(key);
        nextOrder += 1;
        toCreate.push(
          this.categorySpecsRepository.create({
            categoryId,
            name,
            showInCategory: true,
            order: nextOrder,
            image: null,
          }),
        );
      }
    }

    if (toCreate.length > 0) {
      await this.categorySpecsRepository.save(toCreate);
    }
  }

  /** Склеивает дубликаты вроде «Мощность» / «мощность» в одну запись. */
  private async dedupeCategorySpecs(categoryId: number): Promise<void> {
    const specs = await this.categorySpecsRepository.find({
      where: { categoryId },
      order: { order: 'ASC', id: 'ASC' },
    });

    const groups = new Map<string, CategorySpecification[]>();
    for (const spec of specs) {
      const key = normalizeSpecName(spec.name || '');
      if (!key) {
        continue;
      }
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(spec);
    }

    for (const [, group] of groups.entries()) {
      if (group.length < 2) {
        const only = group[0];
        if (only) {
          const canonical = canonicalizeSpecDisplayName(only.name);
          if (canonical && canonical !== only.name) {
            await this.categorySpecsRepository.update(only.id, { name: canonical });
          }
        }
        continue;
      }

      const keeper = [...group].sort((a, b) => {
        const showDiff = Number(!!b.showInCategory) - Number(!!a.showInCategory);
        if (showDiff !== 0) {
          return showDiff;
        }
        const orderDiff = (a.order || 0) - (b.order || 0);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.id - b.id;
      })[0];

      const showInCategory = group.some((spec) => !!spec.showInCategory);
      const image = group.find((spec) => !!spec.image)?.image || null;
      const order = Math.min(...group.map((spec) => spec.order || 0));
      const name = canonicalizeSpecDisplayName(keeper.name) || keeper.name;

      await this.categorySpecsRepository.update(keeper.id, {
        name,
        showInCategory,
        image,
        order,
      });

      const toDelete = group.filter((spec) => spec.id !== keeper.id);
      for (const spec of toDelete) {
        if (spec.image && spec.image !== image) {
          const key = this.extractKeyFromUrl(spec.image);
          if (key) {
            await this.storageService.deleteFile(key);
          }
        }
      }
      if (toDelete.length > 0) {
        await this.categorySpecsRepository.delete({ id: In(toDelete.map((spec) => spec.id)) });
      }
    }
  }

  async findAll(): Promise<Category[]> {
    const categories = await this.categoriesRepository.find({
      relations: ['products', 'specifications'],
      order: { order: 'ASC' },
    });
    return Promise.all(categories.map((c) => this.transformCategory(c)));
  }

  async findOne(id: number): Promise<Category | null> {
    await this.backfillSpecsFromProducts(id);
    await this.dedupeCategorySpecs(id);
    const category = await this.categoriesRepository.findOne({
      where: { id },
      relations: ['products', 'specifications'],
    });
    return category ? await this.transformCategory(category) : null;
  }

  async create(
    category: Partial<Category> & { specifications?: CategorySpecInput[] },
  ): Promise<Category> {
    const { specifications, ...categoryData } = category;

    if (categoryData.order === undefined || categoryData.order === null) {
      const maxOrder = await this.categoriesRepository
        .createQueryBuilder('category')
        .select('MAX(category.order)', 'max')
        .getRawOne();
      categoryData.order = (maxOrder?.max || 0) + 1;
    }

    const newCategory = this.categoriesRepository.create(categoryData);
    const saved = await this.categoriesRepository.save(newCategory);

    if (specifications) {
      await this.syncSpecifications(saved.id, specifications);
    }

    const result = await this.findOne(saved.id);
    return result!;
  }

  private extractKeyFromUrl(url: string): string | null {
    if (!url) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return url;
    }

    const urlWithoutQuery = url.split('?')[0].split('%3F')[0];
    const parts = urlWithoutQuery.split('/').filter((part) => part.length > 0);

    const domainIndex = parts.findIndex((part) => part.includes('twcstorage.ru'));
    if (domainIndex < 0) {
      return parts.length >= 2 ? parts.slice(-2).join('/') : null;
    }

    let startIndex = domainIndex + 1;

    if (startIndex < parts.length) {
      const bucketName = parts[startIndex];
      startIndex++;
      if (startIndex < parts.length && parts[startIndex] === bucketName) {
        startIndex++;
      }
    }

    if (startIndex < parts.length) {
      return parts.slice(startIndex).join('/');
    }

    return parts.length >= 2 ? parts.slice(-2).join('/') : null;
  }

  private isTruthy(value: boolean | string | undefined): boolean {
    return value === true || value === 'true';
  }

  async syncSpecifications(categoryId: number, specs: CategorySpecInput[]): Promise<void> {
    const existing = await this.categorySpecsRepository.find({ where: { categoryId } });

    // Склеиваем входящие дубли по нормализованному имени
    const incomingMerged = new Map<string, CategorySpecInput & { order: number }>();
    specs.forEach((spec, index) => {
      const name = canonicalizeSpecDisplayName(spec.name || '');
      const key = normalizeSpecName(name);
      if (!key) {
        return;
      }
      const prev = incomingMerged.get(key);
      if (!prev) {
        incomingMerged.set(key, {
          ...spec,
          name,
          order: spec.order ?? index,
          showInCategory: this.isTruthy(spec.showInCategory),
        });
        return;
      }
      incomingMerged.set(key, {
        ...prev,
        id: prev.id || spec.id,
        name,
        showInCategory: this.isTruthy(prev.showInCategory) || this.isTruthy(spec.showInCategory),
        image: prev.image || spec.image,
        removeImage: this.isTruthy(prev.removeImage) && this.isTruthy(spec.removeImage),
        order: Math.min(prev.order, spec.order ?? index),
      });
    });

    const normalizedIncoming = [...incomingMerged.values()];
    const incomingIds = new Set(
      normalizedIncoming
        .map((spec) => spec.id)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    );

    const toDelete = existing.filter((spec) => !incomingIds.has(spec.id));
    for (const spec of toDelete) {
      if (spec.image) {
        const key = this.extractKeyFromUrl(spec.image);
        if (key) {
          await this.storageService.deleteFile(key);
        }
      }
    }
    if (toDelete.length > 0) {
      await this.categorySpecsRepository.delete({ id: In(toDelete.map((spec) => spec.id)) });
    }

    for (let index = 0; index < normalizedIncoming.length; index++) {
      const input = normalizedIncoming[index];
      const name = input.name;
      if (!name) {
        continue;
      }

      const existingSpec = input.id ? existing.find((spec) => spec.id === input.id) : undefined;
      let imageKey: string | null = existingSpec?.image || null;

      if (this.isTruthy(input.removeImage)) {
        if (imageKey) {
          const key = this.extractKeyFromUrl(imageKey);
          if (key) {
            await this.storageService.deleteFile(key);
          }
        }
        imageKey = null;
      } else if (input.image) {
        const newKey = this.extractKeyFromUrl(input.image);
        const oldKey = imageKey ? this.extractKeyFromUrl(imageKey) : null;
        if (newKey && oldKey && newKey !== oldKey) {
          await this.storageService.deleteFile(oldKey);
        }
        imageKey = newKey;
      }

      const payload = {
        name,
        showInCategory: this.isTruthy(input.showInCategory),
        order: input.order ?? index,
        image: imageKey,
      };

      if (existingSpec) {
        await this.categorySpecsRepository.update(existingSpec.id, payload);
      } else {
        await this.categorySpecsRepository.save(
          this.categorySpecsRepository.create({
            categoryId,
            ...payload,
          }),
        );
      }
    }

    await this.dedupeCategorySpecs(categoryId);
  }

  async update(
    id: number,
    category: Partial<Category> & { specifications?: CategorySpecInput[] },
  ): Promise<Category | null> {
    const existingCategory = await this.categoriesRepository.findOne({ where: { id } });
    if (!existingCategory) return null;

    const { specifications, ...categoryData } = category;

    if (categoryData.image && existingCategory.image) {
      const newKey = this.extractKeyFromUrl(categoryData.image);
      const oldKey = this.extractKeyFromUrl(existingCategory.image);
      if (newKey && oldKey && newKey !== oldKey) {
        await this.storageService.deleteFile(oldKey);
      }
      if (newKey) {
        categoryData.image = newKey;
      }
    }

    await this.categoriesRepository.update(id, categoryData);

    if (specifications) {
      await this.syncSpecifications(id, specifications);
    }

    return await this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
      relations: ['specifications'],
    });
    if (category?.image) {
      await this.storageService.deleteFile(category.image);
    }
    if (category?.specifications) {
      for (const spec of category.specifications) {
        if (spec.image) {
          const key = this.extractKeyFromUrl(spec.image);
          if (key) {
            await this.storageService.deleteFile(key);
          }
        }
      }
    }
    await this.categoriesRepository.delete(id);
  }

  async updateOrder(categoryOrders: { id: number; order: number }[]): Promise<void> {
    await Promise.all(
      categoryOrders.map(({ id, order }) => this.categoriesRepository.update(id, { order })),
    );
  }
}

