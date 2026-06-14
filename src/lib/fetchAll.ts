import { supabase } from './supabase';

// Busca TODOS os registros de uma tabela, ignorando o limite padrao de 1000 linhas do Supabase
export async function fetchAllRows<T = any>(
  queryBuilder: (from: number, to: number) => any,
  pageSize = 1000
): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder(from, from + pageSize - 1);
    if (error) { console.error('fetchAllRows erro:', error); break; }
    const chunk = (data as T[]) || [];
    all = all.concat(chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
