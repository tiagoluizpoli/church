import { DomainError } from '@church/core';

export class LogoTooLargeError extends DomainError {
  readonly code = 'LOGO_TOO_LARGE' as const;
  constructor() {
    super('The logo file is over 5 MB');
  }
}

export class LogoTooSmallError extends DomainError {
  readonly code = 'LOGO_TOO_SMALL' as const;
  constructor() {
    super("The logo's longest side is under 128 px");
  }
}

export class LogoBadAspectRatioError extends DomainError {
  readonly code = 'LOGO_BAD_ASPECT_RATIO' as const;
  constructor() {
    super("The logo's ratio is outside 1:1–4:3");
  }
}

export class LogoUnsupportedTypeError extends DomainError {
  readonly code = 'LOGO_UNSUPPORTED_TYPE' as const;
  constructor() {
    super('The logo is not a readable PNG, JPEG or WebP image');
  }
}

export class LogoKeyInvalidError extends DomainError {
  readonly code = 'LOGO_KEY_INVALID' as const;
  constructor() {
    super("The key is not one of the Church's logos");
  }
}
