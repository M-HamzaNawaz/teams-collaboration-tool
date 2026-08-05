import type { Rule } from '../types'
import { emailRules } from './email'
import { linkRules } from './links'
import { paymentRules } from './payment'
import { phoneRules } from './phone'

export const allRules: Rule[] = [
  ...emailRules,
  ...phoneRules,
  ...paymentRules,
  ...linkRules,
]
