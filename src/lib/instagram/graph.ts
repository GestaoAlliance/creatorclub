import type { IgMediaType } from "@/domain";

/**
 * API do Instagram pela conta da marca (D-INSTAGRAM): `business_discovery` lê qualquer perfil profissional público;
 * `/tags` lista os posts que marcaram a marca. Token do usuário do sistema (META_SYSTEM_TOKEN), só no servidor.
 */

export const GRAPH_VERSION = "v23.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const POSTS_PER_READ = 30;

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Erro da Meta que vale tentar de novo depois (limite, instabilidade, token). */
export class GraphError extends Error {
  constructor(message: string, readonly code: number | null) {
    super(message);
  }
}

export type GraphPost = {
  id: string;
  postedAt: Date;
  mediaType: IgMediaType;
  productType: string | null;
  likes: number | null;
  comments: number | null;
  caption: string | null;
  permalink: string;
};

export type Discovery = { status: "OK"; followers: number; mediaCount: number; posts: GraphPost[] } | { status: "UNREADABLE" };

type RawMedia = {
  id?: string;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
  like_count?: number;
  comments_count?: number;
  caption?: string;
  permalink?: string;
  username?: string;
};

const TYPES: readonly string[] = ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"];

function toPost(m: RawMedia): GraphPost | null {
  if (!m.id || !m.timestamp || !m.permalink) return null;
  const at = new Date(m.timestamp.replace(/\+0000$/, "Z"));
  if (Number.isNaN(at.getTime())) return null;
  return {
    id: m.id,
    postedAt: at,
    mediaType: (TYPES.includes(m.media_type ?? "") ? m.media_type : "IMAGE") as IgMediaType,
    productType: m.media_product_type ?? null,
    likes: typeof m.like_count === "number" ? m.like_count : null,
    comments: typeof m.comments_count === "number" ? m.comments_count : null,
    caption: m.caption ? m.caption.slice(0, 2200) : null,
    permalink: m.permalink,
  };
}

async function call(fetcher: Fetcher, url: string): Promise<{ data?: unknown; error?: { code?: number; error_subcode?: number; message?: string } }> {
  const res = await fetcher(url);
  return (await res.json().catch(() => ({}))) as { error?: { code?: number; error_subcode?: number; message?: string } };
}

/** Perfil da creator: seguidores e últimos posts. Perfil pessoal, privado ou inexistente: UNREADABLE. */
export async function discoverProfile(fetcher: Fetcher, token: string, brandIgId: string, handle: string): Promise<Discovery> {
  const fields = `business_discovery.username(${handle}){followers_count,media_count,media.limit(${POSTS_PER_READ}){id,timestamp,media_type,media_product_type,like_count,comments_count,caption,permalink}}`;
  const body = (await call(fetcher, `${BASE}/${brandIgId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`)) as {
    business_discovery?: { followers_count?: number; media_count?: number; media?: { data?: RawMedia[] } };
    error?: { code?: number; error_subcode?: number; message?: string };
  };
  if (body.error) {
    // 110 / 2207013: @ não encontrado ou não é conta profissional. 100 com "username": @ inválido.
    if (body.error.code === 110 || body.error.error_subcode === 2207013 || (body.error.code === 100 && /username|user/i.test(body.error.message ?? ""))) {
      return { status: "UNREADABLE" };
    }
    throw new GraphError(body.error.message ?? "Erro da Meta.", body.error.code ?? null);
  }
  const d = body.business_discovery;
  if (!d || typeof d.followers_count !== "number") return { status: "UNREADABLE" };
  return {
    status: "OK",
    followers: d.followers_count,
    mediaCount: d.media_count ?? 0,
    posts: (d.media?.data ?? []).map(toPost).filter((p): p is GraphPost => p !== null),
  };
}

export type GraphTag = Omit<GraphPost, "mediaType" | "productType" | "caption"> & { username: string };

/** Posts que marcaram a marca (os mais recentes primeiro), até `max`. */
export async function brandTags(fetcher: Fetcher, token: string, brandIgId: string, max = 100): Promise<GraphTag[]> {
  const out: GraphTag[] = [];
  let url: string | null = `${BASE}/${brandIgId}/tags?fields=id,username,timestamp,permalink,like_count,comments_count&limit=50&access_token=${encodeURIComponent(token)}`;
  while (url && out.length < max) {
    const body = (await call(fetcher, url)) as { data?: RawMedia[]; paging?: { next?: string }; error?: { code?: number; message?: string } };
    if (body.error) throw new GraphError(body.error.message ?? "Erro da Meta.", body.error.code ?? null);
    for (const m of body.data ?? []) {
      const p = toPost(m);
      if (p && m.username) out.push({ id: p.id, postedAt: p.postedAt, likes: p.likes, comments: p.comments, permalink: p.permalink, username: m.username.toLowerCase() });
    }
    url = body.paging?.next ?? null;
  }
  return out.slice(0, max);
}

export const realFetcher: Fetcher = (url) => fetch(url, { cache: "no-store" });
