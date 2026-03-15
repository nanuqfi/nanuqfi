import type { BackendCapabilities, YieldBackend } from './interfaces'

export class YieldBackendRegistry {
  private backends: Map<string, YieldBackend> = new Map()

  register(backend: YieldBackend): void {
    if (this.backends.has(backend.name)) {
      throw new Error(`Backend "${backend.name}" is already registered`)
    }
    this.backends.set(backend.name, backend)
  }

  unregister(name: string): void {
    this.backends.delete(name)
  }

  get(name: string): YieldBackend | undefined {
    return this.backends.get(name)
  }

  list(): YieldBackend[] {
    return [...this.backends.values()]
  }

  filterByCapability(
    predicate: (capabilities: BackendCapabilities) => boolean,
  ): YieldBackend[] {
    return this.list().filter(b => predicate(b.capabilities))
  }
}
