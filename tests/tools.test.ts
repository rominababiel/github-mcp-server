import { describe, expect, it } from "vitest";
import {
  closeIssueSchema,
  createBranchSchema,
  createCommitSchema,
  createIssueSchema,
  createRepositorySchema,
  healthCheckSchema,
  listIssuesSchema,
  listRepositoriesSchema,
} from "../src/schemas/index.js";

const repository = { owner: "octocat", repo: "hello-world" };

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.error?.issues[0]?.message;
}

describe("createRepositorySchema", () => {
  it.each(["abc", "mi-proyecto-2", "A".repeat(100)])("acepta el nombre válido %s", (name) => {
    expect(createRepositorySchema.safeParse({ name }).success).toBe(true);
  });

  it.each([
    ["ab", "al menos 3"],
    ["a".repeat(101), "100"],
    ["mi proyecto", "letras, números y guiones"],
    ["mi_proyecto", "letras, números y guiones"],
    ["mi.proyecto", "letras, números y guiones"],
  ])("rechaza el nombre %s con un mensaje claro", (name, expected) => {
    expect(firstMessage(createRepositorySchema.safeParse({ name }))).toContain(expected);
  });

  it("explica que falta el nombre cuando no se envía", () => {
    expect(firstMessage(createRepositorySchema.safeParse({}))).toBe(
      "El nombre del repositorio es obligatorio y debe ser texto.",
    );
  });

  it("aplica valores por defecto seguros", () => {
    expect(createRepositorySchema.parse({ name: "demo" })).toMatchObject({ private: false, autoInit: true });
  });

  it("rechaza una descripción con saltos de línea, que GitHub no admite", () => {
    const result = createRepositorySchema.safeParse({ name: "demo", description: "línea 1\nlínea 2" });

    expect(firstMessage(result)).toContain("saltos de línea");
  });

  it("rechaza una descripción de más de 350 caracteres", () => {
    expect(createRepositorySchema.safeParse({ name: "demo", description: "a".repeat(351) }).success).toBe(false);
  });
});

describe("referencias a repositorios existentes", () => {
  it.each(["mi_repo", "a.b", "x"])("acepta %s, válido en GitHub aunque no se permita al crear", (repo) => {
    expect(listIssuesSchema.safeParse({ owner: "octocat", repo }).success).toBe(true);
  });

  it.each(["-octocat", "octocat-", "octo cat", "a".repeat(40)])("rechaza el dueño inválido %s", (owner) => {
    expect(listIssuesSchema.safeParse({ owner, repo: "demo" }).success).toBe(false);
  });

  it.each([".", ".."])("rechaza %s como nombre de repositorio, que GitHub no admite", (repo) => {
    expect(firstMessage(listIssuesSchema.safeParse({ owner: "octocat", repo }))).toBe(
      "El nombre del repositorio no puede ser . ni ..",
    );
  });

  it("nombra a la organización en sus propios errores", () => {
    expect(firstMessage(createRepositorySchema.safeParse({ name: "demo", organization: "mi org" }))).toContain(
      "El nombre de la organización",
    );
  });
});

describe("createIssueSchema", () => {
  it("acepta un título con cuerpo opcional", () => {
    expect(createIssueSchema.safeParse({ ...repository, title: "Bug en login" }).success).toBe(true);
  });

  it("rechaza un título formado solo por espacios", () => {
    expect(firstMessage(createIssueSchema.safeParse({ ...repository, title: "   " }))).toContain("vacío");
  });

  it("rechaza un título de más de 256 caracteres", () => {
    expect(createIssueSchema.safeParse({ ...repository, title: "a".repeat(257) }).success).toBe(false);
  });
});

describe("createCommitSchema", () => {
  const commit = { ...repository, content: "# Hola", message: "docs: add guide" };

  it.each(["README.md", "docs/guia.md", ".github/workflows/ci.yml"])("acepta la ruta %s", (path) => {
    expect(createCommitSchema.safeParse({ ...commit, path }).success).toBe(true);
  });

  it.each(["/README.md", "docs/", "../secreto.txt", "docs//guia.md", "docs\\guia.md", ".git/config"])(
    "rechaza la ruta insegura o inválida %s",
    (path) => {
      expect(createCommitSchema.safeParse({ ...commit, path }).success).toBe(false);
    },
  );

  it("permite crear un archivo vacío", () => {
    expect(createCommitSchema.safeParse({ ...commit, path: ".gitkeep", content: "" }).success).toBe(true);
  });
});

describe("createBranchSchema", () => {
  it.each(["main", "feat/login", "release-1.2"])("acepta la rama %s", (branch) => {
    expect(createBranchSchema.safeParse({ ...repository, branch }).success).toBe(true);
  });

  it.each(["mi rama", "feat..login", "-rama", "feat/", "rama.lock", "ra~ma", "a//b"])(
    "rechaza la rama inválida %s",
    (branch) => {
      expect(createBranchSchema.safeParse({ ...repository, branch }).success).toBe(false);
    },
  );
});

describe("parámetros desconocidos", () => {
  it("rechaza un parámetro que el tool no admite e indica los aceptados", () => {
    const result = createIssueSchema.safeParse({ ...repository, title: "Bug", labels: ["bug"] });

    expect(firstMessage(result)).toBe("Parámetros desconocidos: labels. Los aceptados son: owner, repo, title, body.");
  });

  it("indica que health_check no recibe parámetros", () => {
    expect(firstMessage(healthCheckSchema.safeParse({ verbose: true }))).toBe(
      "Parámetros desconocidos: verbose. Este tool no recibe parámetros.",
    );
  });
});

describe("listIssuesSchema", () => {
  it("trae los issues abiertos por defecto", () => {
    expect(listIssuesSchema.parse(repository).state).toBe("open");
  });

  it.each(["open", "closed", "all"])("acepta el estado %s", (state) => {
    expect(listIssuesSchema.safeParse({ ...repository, state }).success).toBe(true);
  });

  it("rechaza un estado que GitHub no reconoce", () => {
    expect(firstMessage(listIssuesSchema.safeParse({ ...repository, state: "todos" }))).toBe(
      "El estado debe ser open, closed o all.",
    );
  });
});

describe("límites y números", () => {
  it("usa 30 resultados por defecto", () => {
    expect(listRepositoriesSchema.parse({}).limit).toBe(30);
  });

  it.each([0, 101, 1.5])("rechaza el límite %s", (limit) => {
    expect(listRepositoriesSchema.safeParse({ limit }).success).toBe(false);
  });

  it.each([0, -1, 1.5])("rechaza el número de issue %s", (issueNumber) => {
    expect(closeIssueSchema.safeParse({ ...repository, issueNumber }).success).toBe(false);
  });
});
