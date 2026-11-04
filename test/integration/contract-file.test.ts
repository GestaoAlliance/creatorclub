import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { attachContractFile, CONTRACT_BUCKET, contractFileLocation, contractFilePath } from "@/lib/contracts/attachment";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "GESTAO" | "PAGAMENTO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}
const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4\n${text}\n%%EOF`);

describe("contrato assinado anexado (D-CONTRACTFILE, banco real)", () => {
  it("Gestão da marca anexa; trocar guarda o anterior; a creator e a equipe abrem; outras marcas e quem só vê não anexam", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    const gestao = await staff("GESTAO", brand.id);
    const up1 = randomUUID();

    await expect(attachContractFile(prisma, await staff("GESTAO", other.brand.id), creator.id, up1, pdf("a"))).rejects.toThrow(/permissão/);
    await expect(attachContractFile(prisma, await staff("PAGAMENTO", brand.id), creator.id, up1, pdf("a"))).rejects.toThrow(/permissão/);
    await expect(attachContractFile(prisma, gestao, creator.id, up1, new TextEncoder().encode("não é pdf"))).rejects.toThrow(/não é um PDF/);
    await expect(attachContractFile(prisma, gestao, creator.id, "../x", pdf("a"))).rejects.toThrow(/inválido/);
    await expect(contractFileLocation(prisma, { portalCreatorId: creator.id }, creator.id)).rejects.toThrow(/Nenhum contrato/);

    const first = await attachContractFile(prisma, gestao, creator.id, up1, pdf("a"));
    expect(await contractFileLocation(prisma, { portalCreatorId: creator.id }, creator.id)).toEqual({ bucket: CONTRACT_BUCKET, path: contractFilePath(brand.id, creator.id, up1) });
    expect((await contractFileLocation(prisma, { actor: gestao }, creator.id)).path).toContain(up1);
    await expect(contractFileLocation(prisma, { portalCreatorId: other.creator.id }, creator.id)).rejects.toThrow(/permissão/);
    await expect(contractFileLocation(prisma, { actor: await staff("GESTAO", other.brand.id) }, creator.id)).rejects.toThrow(/permissão/);

    const up2 = randomUUID();
    const second = await attachContractFile(prisma, await staff("SUPER_ADMIN", null), creator.id, up2, pdf("b"));
    expect((await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } })).contractFileId).toBe(second.fileId);
    expect(await prisma.file.findUnique({ where: { id: first.fileId } })).not.toBeNull(); // nada é apagado
    const logs = await prisma.auditLog.findMany({ where: { entityId: creator.id, action: "creator.contract_file" }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => (l.after as { contractFileId: string }).contractFileId)).toEqual([first.fileId, second.fileId]);
  });
});
