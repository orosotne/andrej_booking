/** Domain errors carrying an HTTP status, mapped to responses in route handlers. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    /** Extra machine-readable context sent along in the JSON error body. */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = code;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Neplatná požiadavka") {
    super(message, 400, "VALIDATION");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Neprihlásený") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Nedostatočné oprávnenie") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Nenájdené") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Konflikt") {
    super(message, 409, "CONFLICT");
  }
}

/**
 * A patient registered fewer than NEW_PATIENT_DAYS days ago is being booked
 * into a dispenzár slot reserved for established patients
 * (lib/new-patient-rule.ts). The client answers it by asking for the
 * override password and retrying with it.
 */
export class NewPatientSlotError extends AppError {
  constructor(
    message: string,
    details: { registeredOn: string; allowedFrom: string },
  ) {
    super(message, 403, "NEW_PATIENT_SLOT", details);
  }
}
