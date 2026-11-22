import { ValidationRuleError } from './validation-rule-error';

/** A time block's place names a Church Address the Church does not have. */
export class PlaceAddressNotFoundError extends ValidationRuleError {
  readonly reason = 'PLACE_ADDRESS_NOT_FOUND';

  constructor() {
    super('The place is not one of the Church Addresses');
  }
}
