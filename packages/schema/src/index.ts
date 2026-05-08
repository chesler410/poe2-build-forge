import Ajv2020 from 'ajv/dist/2020'
import type { ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import schemaJson from './poe2-build.schema.json'

export const schema = schemaJson

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)

const compiledValidator = ajv.compile(schemaJson)

export interface ValidationResult {
  valid: boolean
  errors: ErrorObject[] | null
}

export function validate(input: unknown): ValidationResult {
  const valid = compiledValidator(input)
  return { valid, errors: compiledValidator.errors ?? null }
}
