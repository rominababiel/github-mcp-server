import { z } from "zod";

const CONTROL_CHARACTER = /\p{Cc}/u;

function requiredText(label: string) {
  return z.string({ error: `${label} es obligatorio y debe ser texto.` }).trim();
}

const ownerSchema = requiredText("El dueño del repositorio")
  .min(1, "El dueño del repositorio no puede estar vacío.")
  .max(39, "El dueño del repositorio no puede superar los 39 caracteres.")
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?$/,
    "El dueño solo admite letras, números, guiones y guiones bajos, y debe empezar y terminar con letra o número.",
  )
  .describe("Usuario u organización dueña del repositorio. Si no se conoce, obtenerla con list_repositories o health_check.");

const existingRepositoryNameSchema = requiredText("El nombre del repositorio")
  .min(1, "El nombre del repositorio no puede estar vacío.")
  .max(100, "El nombre del repositorio no puede superar los 100 caracteres.")
  .regex(/^[a-zA-Z0-9._-]+$/, "El nombre del repositorio solo admite letras, números, puntos, guiones y guiones bajos.")
  .describe("Nombre de un repositorio existente, sin el dueño. Ejemplo: mi-proyecto.");

export const newRepositoryNameSchema = requiredText("El nombre del repositorio")
  .min(3, "El nombre del repositorio debe tener al menos 3 caracteres.")
  .max(100, "El nombre del repositorio no puede superar los 100 caracteres.")
  .regex(/^[a-zA-Z0-9-]+$/, "El nombre del repositorio solo admite letras, números y guiones.")
  .describe("Nombre del repositorio a crear: entre 3 y 100 caracteres, solo letras, números y guiones.");

const branchNameSchema = requiredText("El nombre de la rama")
  .min(1, "El nombre de la rama no puede estar vacío.")
  .max(255, "El nombre de la rama no puede superar los 255 caracteres.")
  .refine(
    (name) =>
      !/[\s~^:?*[\\]|\.\.|@\{|\/\/|^[-/.]|[/.]$|\.lock$/.test(name) && !CONTROL_CHARACTER.test(name),
    "El nombre de la rama no es válido: evita espacios, los caracteres ~ ^ : ? * [ \\, los puntos dobles y terminar en / o .lock.",
  );

const limitSchema = z
  .number({ error: "La cantidad de resultados debe ser un número." })
  .int("La cantidad de resultados debe ser un número entero.")
  .min(1, "La cantidad de resultados debe ser al menos 1.")
  .max(100, "La cantidad de resultados no puede superar 100.")
  .default(30)
  .describe("Cantidad máxima de resultados, entre 1 y 100.");

const issueNumberSchema = z
  .number({ error: "El número de issue es obligatorio y debe ser un número." })
  .int("El número de issue debe ser un entero.")
  .positive("El número de issue debe ser mayor que 0.")
  .describe("Número visible del issue, sin el símbolo #.");

const repositoryReference = {
  owner: ownerSchema,
  repo: existingRepositoryNameSchema,
};

export const createRepositorySchema = z.object({
  name: newRepositoryNameSchema,
  description: z
    .string({ error: "La descripción debe ser texto." })
    .trim()
    .max(350, "La descripción no puede superar los 350 caracteres.")
    .refine((text) => !CONTROL_CHARACTER.test(text), "La descripción no puede contener saltos de línea ni caracteres de control.")
    .optional()
    .describe("Descripción corta del repositorio, de hasta 350 caracteres y en una sola línea."),
  private: z.boolean({ error: "private debe ser verdadero o falso." }).default(false).describe("Crear el repositorio como privado."),
  autoInit: z
    .boolean({ error: "autoInit debe ser verdadero o falso." })
    .default(true)
    .describe("Crear un README inicial, necesario para poder crear ramas de inmediato."),
  organization: ownerSchema
    .optional()
    .describe("Organización donde crearlo. Omitir para crearlo en la cuenta personal."),
});

export const listRepositoriesSchema = z.object({
  visibility: z
    .enum(["all", "public", "private"], { error: "La visibilidad debe ser all, public o private." })
    .default("all")
    .describe("Filtrar por visibilidad."),
  limit: limitSchema,
});

export const createIssueSchema = z.object({
  ...repositoryReference,
  title: requiredText("El título del issue")
    .min(1, "El título del issue no puede estar vacío.")
    .max(256, "El título del issue no puede superar los 256 caracteres.")
    .describe("Título breve que resuma el problema o la tarea."),
  body: z
    .string({ error: "El cuerpo del issue debe ser texto." })
    .max(65_536, "El cuerpo del issue no puede superar los 65536 caracteres.")
    .optional()
    .describe("Detalle del issue en Markdown."),
});

export const listIssuesSchema = z.object({
  ...repositoryReference,
  limit: limitSchema,
});

export const createCommitSchema = z.object({
  ...repositoryReference,
  path: requiredText("La ruta del archivo")
    .min(1, "La ruta del archivo no puede estar vacía.")
    .refine(
      (path) => !path.startsWith("/") && !path.endsWith("/") && !path.includes("\\"),
      "La ruta debe ser relativa a la raíz, usar / como separador y no terminar en /.",
    )
    .refine(
      (path) => !path.split("/").some((segment) => ["", ".", "..", ".git"].includes(segment)),
      "La ruta no puede contener segmentos vacíos, ., .. ni .git.",
    )
    .describe("Ruta del archivo desde la raíz del repositorio. Ejemplo: docs/guia.md."),
  content: z
    .string({ error: "El contenido del archivo es obligatorio y debe ser texto." })
    .max(1_000_000, "El contenido del archivo no puede superar 1.000.000 de caracteres.")
    .describe("Contenido completo final del archivo en texto. Reemplaza al contenido anterior si el archivo ya existe."),
  message: requiredText("El mensaje del commit")
    .min(1, "El mensaje del commit no puede estar vacío.")
    .describe("Mensaje del commit que explique el cambio."),
  branch: branchNameSchema.optional().describe("Rama existente donde commitear. Omitir para usar la rama por defecto."),
});

export const createBranchSchema = z.object({
  ...repositoryReference,
  branch: branchNameSchema.describe("Nombre de la rama nueva. Ejemplo: feat/login."),
  fromBranch: branchNameSchema.optional().describe("Rama de origen. Omitir para partir de la rama por defecto."),
});

export const createPullRequestSchema = z.object({
  ...repositoryReference,
  title: requiredText("El título del pull request")
    .min(1, "El título del pull request no puede estar vacío.")
    .max(256, "El título del pull request no puede superar los 256 caracteres.")
    .describe("Título del pull request."),
  head: branchNameSchema.describe("Rama con los cambios."),
  base: branchNameSchema.optional().describe("Rama destino. Omitir para usar la rama por defecto."),
  body: z
    .string({ error: "La descripción del pull request debe ser texto." })
    .max(65_536, "La descripción del pull request no puede superar los 65536 caracteres.")
    .optional()
    .describe("Descripción del pull request en Markdown."),
});

export const listCommitsSchema = z.object({
  ...repositoryReference,
  branch: branchNameSchema.optional().describe("Rama a consultar. Omitir para usar la rama por defecto."),
  limit: limitSchema,
});

export const closeIssueSchema = z.object({
  ...repositoryReference,
  issueNumber: issueNumberSchema,
  reason: z
    .enum(["completed", "not_planned"], { error: "El motivo debe ser completed o not_planned." })
    .default("completed")
    .describe("Motivo del cierre: completed si se resolvió, not_planned si se descartó."),
});

export const healthCheckSchema = z.object({});

export type CreateRepositoryInput = z.output<typeof createRepositorySchema>;
export type ListRepositoriesInput = z.output<typeof listRepositoriesSchema>;
export type CreateIssueInput = z.output<typeof createIssueSchema>;
export type ListIssuesInput = z.output<typeof listIssuesSchema>;
export type CreateCommitInput = z.output<typeof createCommitSchema>;
export type CreateBranchInput = z.output<typeof createBranchSchema>;
export type CreatePullRequestInput = z.output<typeof createPullRequestSchema>;
export type ListCommitsInput = z.output<typeof listCommitsSchema>;
export type CloseIssueInput = z.output<typeof closeIssueSchema>;
