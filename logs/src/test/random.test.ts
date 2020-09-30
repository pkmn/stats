import {Random} from '../random';

describe('Random', () => {
  test('next', () => {
    let r = new Random(42);
    const q = new Random(42);
    let n = 0;
    for (let i = 0; i <= 100; i++) {
      n = r.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      expect(n).toEqual(q.next());
    }

    r = new Random();
    n = 0;
    for (let i = 0; i <= 100; i++) {
      if (r.next(2) < 1) n++;
    }
    expect(n).toBeGreaterThanOrEqual(45);
    expect(n).toBeLessThanOrEqual(55);

    r = new Random();
    n = 0;
    for (let i = 0; i <= 100; i++) {
      if (r.next(10, 265) < 227) n++;
    }
    expect(n).toBeGreaterThanOrEqual(80);
    expect(n).toBeLessThanOrEqual(90);
  });

  test('sample', () => {
    let r = new Random();
    let a: string[] = [];
    expect(() => r.sample(a)).toThrow(RangeError);

    r = new Random();
    a[30] = 'hello';
    expect(() => {
      for (let i = 0; i < 100; i++) {
        r.sample(a);
      }
    }).toThrow(RangeError);

    r = new Random();
    a = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
    delete a[9];
    expect(() => {
      for (let i = 0; i < 100; i++) {
        r.sample(a);
      }
    }).toThrow(RangeError);

    r = new Random();
    for (let i = 0; i < 10; ++i) {
      expect(r.sample(['a'])).toBe('a');
    }

    r = new Random();
    a = ['a', 'b', 'c', 'd', 'e'];
    const o = {a: 0, b: 0, c: 0, d: 0, e: 0};
    for (let i = 0; i < 1000; ++i) {
      o[r.sample(a) as keyof typeof o]++;
    }
    for (const k of a) {
      expect(o[k as keyof typeof o]).toBeGreaterThanOrEqual(170);
      expect(o[k as keyof typeof o]).toBeLessThanOrEqual(230);
    }

    r = new Random();
    a = ['x', 'x', 'y'];
    const p = {x: 0, y: 0};
    for (let i = 0; i < 1000; ++i) {
      p[r.sample(a) as keyof typeof p]++;
    }
    expect(p.x).toBeGreaterThanOrEqual(630);
    expect(p.x).toBeLessThanOrEqual(710);
    expect(p.y).toBeGreaterThanOrEqual(290);
    expect(p.y).toBeLessThanOrEqual(370);

    r = new Random(5);
    const q = new Random(5);
    const b = [{}, {}, {}, {}, {}, {}, {}, {}];
    for (let i = 0; i < 10; ++i) {
      expect(r.sample(b)).toBe(b[q.next(b.length)]);
    }
  });

  test('shuffle', () => {
    let r = new Random();
    expect(r.shuffle([])).toEqual([]);
    const a = [1, 2, 3, 4, 5];
    const b = a.slice();

    r = new Random(45);
    const q = new Random(45);
    expect(r.shuffle(a)).toEqual(q.shuffle(b));
    expect(a).toEqual(b);

    expect(a).not.toEqual([1, 2, 3, 4, 5]);
  });
});
