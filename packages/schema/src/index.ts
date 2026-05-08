import Ajv2020 from 'ajv/dist/2020'
import type { ErrorObject, AnySchema } from 'ajv'
import addFormats from 'ajv-formats'
import schemaJson from './poe2-build.schema.json'

export interface BuildSchemaDocument {
  $schema: string
  $id: string
  title: string
  description?: string
  type: 'object'
  examples?: unknown[]
  [key: string]: unknown
}

export const schema = schemaJson as BuildSchemaDocument

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)

const compiledValidator = ajv.compile(schema as AnySchema)

export interface ValidationResult {
  valid: boolean
  errors: ErrorObject[] | null
}

export function validate(input: unknown): ValidationResult {
  const valid = compiledValidator(input) as boolean
  return { valid, errors: compiledValidator.errors ?? null }
}
