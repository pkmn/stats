const q = Math.log(10.0) / 400;
const RD = {
  min: 25,
  max: 100
};
const c = 20;

interface Rating {
  R: number;
  RD: number;
  A: number;
  d2: number;
}

export const Glicko = new class {
  g(rd: number) {
    return Math.pow(1.0 + 3.0 * q * q * rd * rd / Math.PI / Math.PI, -0.5);
  }

  expectedScore(r1: number, r2: number, rd2: number) {
    return 1.0 / (1.0 + Math.pow(10, -this.g(rd2) * (r1 - r2) / 400));
  }

  newPlayer() {
    return {R: 1500.0, RD: RD.max, A: 0, d2: 0};
  }

  provisional(rating: Rating) {
    return this.newRatingPeriod(Object.assign({}, rating));
  }

  update(p1rating: Rating, p2rating: Rating, outcome: number) {
    outcome = Math.floor(outcome);
    const p1 = outcome === 1 ? 1 : outcome === 2 ? 0 : 0.5;
    const p2 = 1 - p1;
    const E = {
      p1: this.expectedScore(p1rating.R, p2rating.R, p2rating.RD),
      p2: this.expectedScore(p2rating.R, p1rating.R, p1rating.RD),
    };

    p1rating.A += this.g(p2rating.RD) * (p1 - E.p1);
    p1rating.d2 += Math.pow(this.g(p2rating.RD), 2) * E.p1 * (1 - E.p1);

    p2rating.A += this.g(p1rating.RD) * (p2 - E.p2);
    p2rating.d2 += Math.pow(this.g(p1rating.RD), 2) * E.p2 * (1 - E.p2);

    return {p1rating, p2rating, expected: E.p1};
  }

  newRatingPeriod(rating: Rating) {
    if (rating.d2 === 0) {
      rating.RD = Math.sqrt(Math.pow(rating.RD, 2) + c * c);
    } else {
      const d2inv = 1 / Math.pow(q * q * rating.d2, -1);
      rating.R += q / (Math.pow(rating.RD, -2) + d2inv) * rating.A;
      rating.RD = Math.pow(Math.pow(rating.RD, -2) + d2inv, -0.5);
    }

    if (rating.RD > RD.max) rating.RD = RD.max;
    if (rating.RD < RD.min) rating.RD = RD.min;

    rating.A = 0;
    rating.d2 = 0;
    return rating;
  }
};
