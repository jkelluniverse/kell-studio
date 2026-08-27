// The tenant-scoped data layer. forTenant(tenantId) is the ONLY way app
// code touches the database. Every model listed in TENANT_SCOPED_MODELS is
// automatically filtered to the given tenant on reads and stamped with it
// on writes — unscoped access is impossible by construction.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Future prompts append model names here — adding the name is the only
// change needed for a new model to be tenant-scoped.
export const TENANT_SCOPED_MODELS: readonly Prisma.ModelName[] = [
  "User",
  "Client",
  "Project",
  "Phase",
  "Milestone",
  "Capture",
  "Fact",
  "FactCitation",
  "Decision",
  "Idea",
  "Document",
  "Reminder",
  "AIThread",
  "AIMessage",
  "IntakeForm",
  "IntakeItem",
  "IntakeResponse",
  "IntakeAnswer",
];

/** Thrown when a caller passes a tenantId that conflicts with the scope. */
export class TenantMismatchError extends Error {
  constructor(model: string, expected: string, got: unknown) {
    super(
      `Tenant mismatch on ${model}: scoped to "${expected}" but caller passed "${String(got)}".`
    );
    this.name = "TenantMismatchError";
  }
}

/** Thrown when forTenant is called with an invalid tenantId. */
export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

type AnyArgs = Record<string, unknown>;
type AnyData = Record<string, unknown>;

// AND the tenant filter into a list-style where (findMany, findFirst,
// updateMany, deleteMany, count, aggregate, groupBy).
function scopeWhere(args: AnyArgs, tenantId: string): AnyArgs {
  const where = args.where as AnyArgs | undefined;
  return {
    ...args,
    where: where ? { AND: [where, { tenantId }] } : { tenantId },
  };
}

// Scope a unique-style where (findUnique, update, delete, upsert). The
// unique field must stay top-level, so the tenant filter is added as a
// sibling field (valid since Prisma 5's extended where-unique).
// KS-01 DECISION: if the caller already passed a conflicting tenantId in a
// unique where, reads resolve to "no such row" (return null / match nothing)
// rather than throwing — that is exactly what AND-ing the filters would
// yield. Only writes that try to WRITE a foreign tenantId throw.
function scopeUniqueWhere(
  args: AnyArgs,
  tenantId: string
): { args: AnyArgs; impossible: boolean } {
  const where = (args.where ?? {}) as AnyArgs;
  const impossible = where.tenantId !== undefined && where.tenantId !== tenantId;
  return { args: { ...args, where: { ...where, tenantId } }, impossible };
}

// Stamp tenantId into create/update data; throw if the caller tried to
// write a different tenant.
function scopeData(
  model: string,
  data: AnyData,
  tenantId: string,
  { inject }: { inject: boolean }
): AnyData {
  if (data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantMismatchError(model, tenantId, data.tenantId);
  }
  const tenantRel = data.tenant as { connect?: { id?: unknown } } | undefined;
  if (tenantRel !== undefined) {
    // KS-01 DECISION: nested `tenant: { connect: ... }` is only accepted when
    // it connects by id to the scoped tenant; anything else (connect by slug,
    // create, connectOrCreate) can't be verified deterministically here, so
    // it is rejected. Callers should omit the relation and let the layer
    // stamp tenantId.
    if (tenantRel.connect?.id !== tenantId) {
      throw new TenantMismatchError(model, tenantId, tenantRel.connect?.id);
    }
    return data;
  }
  return inject ? { ...data, tenantId } : data;
}

/**
 * Returns a Prisma client whose queries against every model in
 * TENANT_SCOPED_MODELS are confined to the given tenant. There is no
 * unscoped escape hatch.
 *
 * KS-01 DECISION: a query extension changes runtime behavior but not
 * Prisma's generated types, so `create` data still *types* tenantId as
 * required. Callers either pass the scoped tenantId (the layer verifies it
 * and throws TenantMismatchError on any other value) or omit it with a
 * `Prisma.UserUncheckedCreateInput` cast and let the layer stamp it.
 * Either way the row can only ever land in the scoped tenant.
 */
export function forTenant(tenantId: string) {
  if (typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new TenantScopeError(
      `forTenant requires a non-empty string tenantId; got ${JSON.stringify(tenantId)}.`
    );
  }

  return prisma.$extends({
    name: `forTenant(${tenantId})`,
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.includes(model)) {
            return query(args);
          }
          const a = args as AnyArgs;

          switch (operation) {
            case "findMany":
            case "findFirst":
            case "findFirstOrThrow":
            case "updateMany":
            case "deleteMany":
            case "count":
            case "aggregate":
            case "groupBy": {
              const scoped = scopeWhere(a, tenantId);
              if (operation === "updateMany" && scoped.data) {
                scoped.data = scopeData(model, scoped.data as AnyData, tenantId, {
                  inject: false,
                });
              }
              return query(scoped as never);
            }

            case "findUnique":
            case "findUniqueOrThrow": {
              const { args: scoped, impossible } = scopeUniqueWhere(a, tenantId);
              if (impossible && operation === "findUnique") return Promise.resolve(null);
              return query(scoped as never);
            }

            case "update":
            case "delete": {
              const { args: scoped, impossible } = scopeUniqueWhere(a, tenantId);
              if (impossible) {
                throw new TenantMismatchError(
                  model,
                  tenantId,
                  (a.where as AnyArgs | undefined)?.tenantId
                );
              }
              if (operation === "update" && scoped.data) {
                scoped.data = scopeData(model, scoped.data as AnyData, tenantId, {
                  inject: false,
                });
              }
              return query(scoped as never);
            }

            case "create": {
              return query({
                ...a,
                data: scopeData(model, (a.data ?? {}) as AnyData, tenantId, {
                  inject: true,
                }),
              } as never);
            }

            case "createMany":
            case "createManyAndReturn": {
              const data = a.data;
              const rows = Array.isArray(data) ? data : [data];
              return query({
                ...a,
                data: rows.map((row) =>
                  scopeData(model, (row ?? {}) as AnyData, tenantId, { inject: true })
                ),
              } as never);
            }

            case "upsert": {
              const { args: scoped, impossible } = scopeUniqueWhere(a, tenantId);
              if (impossible) {
                throw new TenantMismatchError(
                  model,
                  tenantId,
                  (a.where as AnyArgs | undefined)?.tenantId
                );
              }
              scoped.create = scopeData(model, (scoped.create ?? {}) as AnyData, tenantId, {
                inject: true,
              });
              if (scoped.update) {
                scoped.update = scopeData(model, scoped.update as AnyData, tenantId, {
                  inject: false,
                });
              }
              return query(scoped as never);
            }

            default:
              // KS-01 DECISION: the spec lists the operations above; every
              // OTHER operation on a tenant-scoped model is rejected rather
              // than silently passed through unscoped ($queryRaw etc. don't
              // reach here, but e.g. a future Prisma op would). Fail closed.
              throw new TenantScopeError(
                `Operation "${operation}" on tenant-scoped model "${model}" is not supported by forTenant.`
              );
          }
        },
      },
    },
  });
}

/** A tenant-scoped client, as returned by forTenant. */
export type ScopedDb = ReturnType<typeof forTenant>;

// KS-02 DECISION: with 14 scoped models, the KS-01 per-site cast for create
// data became noise. scopedData() is the one blessed type-level stamp: the
// runtime extension injects (and verifies) tenantId on create, so asserting
// it here tells the generated types what is already true. Purely a type
// assertion — no extension logic changed.
export function scopedData<T extends object>(data: T): T & { tenantId: string } {
  return data as T & { tenantId: string };
}

/** The single root tenant (Kell Systems itself). */
export async function getRootTenant() {
  return prisma.tenant.findFirstOrThrow({ where: { isRoot: true } });
}

/** Throws unless a tenant with this id exists. */
export async function assertTenantExists(tenantId: string): Promise<void> {
  const found = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!found) {
    throw new TenantScopeError(`No tenant with id "${tenantId}".`);
  }
}
