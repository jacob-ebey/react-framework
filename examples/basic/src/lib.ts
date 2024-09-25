import { LoginInput, ProfileInput } from "~/db.js";

export type Validated<T> =
  | {
      valid: false;
    }
  | {
      valid: true;
      data: T;
    };

export function validateLoginInput(formData: FormData): Validated<LoginInput> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (!email || typeof email !== "string") {
    return {
      valid: false,
    };
  }

  if (!password || typeof password !== "string") {
    return {
      valid: false,
    };
  }

  return {
    valid: true,
    data: {
      email,
      password,
    },
  };
}

export function validateProfileInput(
  formData: FormData
): Validated<ProfileInput> {
  const displayName = formData.get("displayName");

  if (!displayName || typeof displayName !== "string") {
    return {
      valid: false,
    };
  }

  return {
    valid: true,
    data: {
      displayName,
    },
  };
}
