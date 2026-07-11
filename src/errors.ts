export type ErrorCode =
  | "invalid_skill"
  | "duplicate_skill"
  | "not_found"
  | "not_a_file"
  | "path_escape"
  | "invalid_input"
  | "io_error";

export class SkillError extends Error {
  readonly code: ErrorCode;
  readonly fields: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, fields: Record<string, unknown> = {}) {
    super(message);
    this.name = "SkillError";
    this.code = code;
    this.fields = fields;
  }
}

export function fsError(err: NodeJS.ErrnoException, path: string): SkillError {
  if (err.code === "ENOENT") return new SkillError("not_found", `No such file: ${path}`, { path });
  if (err.code === "EISDIR")
    return new SkillError("not_a_file", `Path is a directory: ${path}`, { path });
  if (err.code === "ENOTDIR")
    return new SkillError("not_a_file", `Not a directory: ${path}`, { path });
  return new SkillError("io_error", `${err.code ?? "EIO"}: ${err.message}`, { path });
}
