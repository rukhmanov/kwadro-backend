import {
  buildSpecValueMap,
  canonicalizeSpecDisplayName,
  mergeCategorySpecFilters,
  normalizeSpecName,
  parseSpecsQuery,
} from './spec-filters.util';

describe('normalizeSpecName', () => {
  it('trims whitespace and lowercases the name', () => {
    expect(normalizeSpecName('Привод ')).toBe('привод');
    expect(normalizeSpecName('Мощность   150')).toBe('мощность 150');
  });
});

describe('canonicalizeSpecDisplayName', () => {
  it('collapses spaces and capitalizes first letter', () => {
    expect(canonicalizeSpecDisplayName('  мощность  ')).toBe('Мощность');
  });
});

describe('parseSpecsQuery', () => {
  it('parses selected values grouped by specification name', () => {
    expect(parseSpecsQuery('{"Двигатель":["561 куб","176 Loncin"]}')).toEqual({
      Двигатель: ['561 куб', '176 Loncin'],
    });
  });

  it('returns an empty object for missing or invalid input', () => {
    expect(parseSpecsQuery(undefined)).toEqual({});
    expect(parseSpecsQuery('not-json')).toEqual({});
    expect(parseSpecsQuery('[]')).toEqual({});
  });

  it('drops empty names and values', () => {
    expect(parseSpecsQuery('{"Двигатель":["561 куб",""]," ":["x"]}')).toEqual({
      Двигатель: ['561 куб'],
    });
  });
});

describe('buildSpecValueMap', () => {
  it('groups unique product values by normalized specification name', () => {
    const map = buildSpecValueMap([
      { name: 'Двигатель', value: '561 куб' },
      { name: 'двигатель', value: '176 Loncin' },
      { name: 'Двигатель', value: '561 куб' },
      { name: 'Мощность', value: '45лс' },
      { name: 'Пустая', value: '  ' },
    ]);

    expect(map.get('двигатель')).toEqual(['176 Loncin', '561 куб']);
    expect(map.get('мощность')).toEqual(['45лс']);
    expect(map.has('пустая')).toBe(false);
  });
});

describe('mergeCategorySpecFilters', () => {
  it('merges duplicate specification names case-insensitively', () => {
    const merged = mergeCategorySpecFilters([
      {
        id: 1,
        name: 'Мощность',
        image: null,
        showInCategory: true,
        order: 2,
        values: ['150'],
      },
      {
        id: 2,
        name: 'мощность',
        image: 'img',
        showInCategory: false,
        order: 1,
        values: ['200', '150'],
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Мощность');
    expect(merged[0].showInCategory).toBe(true);
    expect(merged[0].image).toBe('img');
    expect(merged[0].order).toBe(1);
    expect(merged[0].values).toEqual(['150', '200']);
  });
});
