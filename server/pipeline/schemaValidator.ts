import { z } from "zod";

/**
 * Validates that a Zod schema is strictly compatible with OpenAI Structured Output (strict mode).
 * In OpenAI strict mode:
 * - `.optional()` / optional fields are prohibited.
 * - `undefined` / `ZodUndefined` is prohibited.
 * - All object properties must be required.
 * - Nullable fields must use `.nullable()` explicitly.
 * - Arrays must be required (`z.array(...)`), returning `[]` when empty.
 */
export function assertOpenAIStrictSchemaCompatible(
  schema: z.ZodTypeAny,
  path: string = "root"
): void {
  if (!schema || typeof schema !== "object" || !("_def" in schema)) {
    return;
  }

  const def = (schema as any)._def;
  const typeName: string = def?.typeName || (schema as any)?.constructor?.name || "";

  if (typeName === "ZodOptional" || typeName.endsWith("Optional")) {
    throw new Error(
      `OpenAI Strict Schema Error at '${path}': .optional() is not supported by OpenAI Strict Output API. Use .nullable() or required arrays/objects.`
    );
  }

  if (typeName === "ZodUndefined" || typeName.endsWith("Undefined")) {
    throw new Error(
      `OpenAI Strict Schema Error at '${path}': ZodUndefined / undefined is not supported in OpenAI Strict Output API.`
    );
  }

  if (typeName === "ZodObject") {
    const shape = typeof def.shape === "function" ? def.shape() : def.shape;
    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        const fieldPath = path ? `${path}.${key}` : key;
        const fieldSchema = value as z.ZodTypeAny;

        const fieldTypeName = (fieldSchema?._def as any)?.typeName || (fieldSchema as any)?.constructor?.name || "";
        if (
          fieldTypeName === "ZodOptional" ||
          fieldTypeName.endsWith("Optional") ||
          (typeof (fieldSchema as any).isOptional === "function" && (fieldSchema as any).isOptional())
        ) {
          throw new Error(
            `OpenAI Strict Schema Error at '${fieldPath}': Property '${key}' is optional. All properties in OpenAI Strict mode must be required.`
          );
        }

        assertOpenAIStrictSchemaCompatible(fieldSchema, fieldPath);
      }
    }
  } else if (typeName === "ZodArray") {
    const elementType = def.type || (schema as any).element || (schema as any)._def?.type;
    if (elementType) {
      assertOpenAIStrictSchemaCompatible(elementType, `${path}[]`);
    }
  } else if (typeName === "ZodUnion" || typeName === "ZodDiscriminatedUnion") {
    const options = def.options || [];
    for (let i = 0; i < options.length; i++) {
      assertOpenAIStrictSchemaCompatible(options[i], `${path}.union[${i}]`);
    }
  } else if (typeName === "ZodNullable") {
    if (def.innerType) {
      assertOpenAIStrictSchemaCompatible(def.innerType, `${path}.nullable`);
    }
  } else if (typeName === "ZodEffects") {
    if (def.schema) {
      assertOpenAIStrictSchemaCompatible(def.schema, path);
    }
  } else if (typeName === "ZodDefault") {
    if (def.innerType) {
      assertOpenAIStrictSchemaCompatible(def.innerType, path);
    }
  }
}
