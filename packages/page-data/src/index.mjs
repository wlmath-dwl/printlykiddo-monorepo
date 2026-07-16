export class DependencyCollector {
  #keys = new Set();

  add(key) {
    if (!key || typeof key !== "string") throw new Error("Dependency key must be a non-empty string");
    this.#keys.add(key);
  }

  entity(type, id) {
    this.add(`entity:${type}:${id}`);
  }

  dataset(name) {
    this.add(`dataset:${name}`);
  }

  template(name) {
    this.add(`template:${name}`);
  }

  fragment(name) {
    this.add(`fragment:${name}`);
  }

  values() {
    return [...this.#keys].sort();
  }
}

export function withCommonPageDependencies(collector, pageFamily) {
  collector.fragment("site-header");
  collector.fragment("site-footer");
  collector.dataset("site-navigation");
  collector.template(pageFamily);
  return collector;
}
