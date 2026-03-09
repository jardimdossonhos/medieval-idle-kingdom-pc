export class EconomyComponent {
  gold: Float64Array;
  wood: Float64Array;

  constructor(maxEntities: number) {
    this.gold = new Float64Array(maxEntities);
    this.wood = new Float64Array(maxEntities);
  }
}

