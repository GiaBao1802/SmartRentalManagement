import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { PrismaNotificationRepository } from "./notification.repository.js";

function repository(options: { room?: boolean; recipients?: bigint[] } = {}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const creates: unknown[] = [];
  const tx = {
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = [...strings].join("?"); queries.push({ sql, values });
      if (sql.includes("FROM rooms r")) return options.room === false ? [] : [{ room_id: 302n, room_code: "302", property_name: "Khu A" }];
      return (options.recipients ?? [501n]).map((account_id) => ({ account_id }));
    },
    notification: { async createMany(input: unknown) { creates.push(input); return { count: 1 }; } },
  };
  const prisma = { async $transaction<T>(action: (client: typeof tx) => Promise<T>) { return action(tx); } } as unknown as PrismaClient;
  return { repository: new PrismaNotificationRepository(prisma), queries, creates };
}

test("room reminder writes only to active residents selected inside the Owner/property/room scope", async () => {
  const setup = repository({ recipients: [501n, 502n] });
  const result = await setup.repository.sendRoomReminder(101n, 50n, 302n, "Vui lòng khóa cửa khi ra ngoài.");
  assert.deepEqual(result, { roomCode: "302", propertyName: "Khu A", recipientCount: 2 });
  assert.deepEqual(setup.queries[0]?.values, [302n, 50n, 101n]);
  assert.match(setup.queries[1]!.sql, /rr\.owner_id = \?/);
  assert.match(setup.queries[1]!.sql, /a\.role = 'resident' AND a\.status = 'active'/);
  assert.match(setup.queries[1]!.sql, /rr\.status = 'active'/);
  assert.deepEqual(setup.creates, [{ data: [501n, 502n].map((accountId) => ({ accountId, notificationType: "owner_room_reminder", title: "Thông báo từ chủ trọ · Phòng 302", body: "Vui lòng khóa cửa khi ra ngoài." })) }]);
});

test("foreign or inactive room is not found; an empty active recipient set creates nothing", async () => {
  const foreign = repository({ room: false });
  assert.equal(await foreign.repository.sendRoomReminder(202n, 50n, 302n, "Không gửi."), null);
  assert.equal(foreign.creates.length, 0);

  const empty = repository({ recipients: [] });
  await assert.rejects(empty.repository.sendRoomReminder(101n, 50n, 302n, "Không có người nhận."), /chưa có tài khoản cư dân đang ở/);
  assert.equal(empty.creates.length, 0);
});
