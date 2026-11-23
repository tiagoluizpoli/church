import type {
  ObjectKeyInput,
  ObjectStorage,
  PutObjectInput,
} from '@/domain/contracts/infrastructure/object-storage';

/** The object-storage fake HTTP tests inject; `objects` is what was stored. */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, Omit<PutObjectInput, 'key'>>();

  async put({ key, ...object }: PutObjectInput): Promise<void> {
    this.objects.set(key, object);
  }

  async delete({ key }: ObjectKeyInput): Promise<void> {
    this.objects.delete(key);
  }

  async exists({ key }: ObjectKeyInput): Promise<boolean> {
    return this.objects.has(key);
  }

  publicUrl({ key }: ObjectKeyInput): string {
    return `https://storage.test/church/${key}`;
  }
}
