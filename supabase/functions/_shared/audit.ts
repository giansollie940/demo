export async function writeAudit(
  admin: any,
  {
    actorId,
    classId = null,
    action,
    entityType,
    entityId = null,
    oldData = null,
    newData = null,
    source = "server",
  }: {
    actorId: string;
    classId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    oldData?: unknown;
    newData?: unknown;
    source?: "server" | "client" | "system";
  },
) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: actorId,
    class_id: classId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    old_data: oldData,
    new_data: newData,
    source,
    created_at: new Date().toISOString(),
  });

  // Audit logging should be visible when it fails, but must not corrupt an
  // already completed business operation.
  if (error) console.error("writeAudit failed", action, error);
}
