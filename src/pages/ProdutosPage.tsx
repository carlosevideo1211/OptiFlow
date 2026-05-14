import { Package } from 'lucide-react';
export default function ProdutosPage() {
  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Produtos</h1><p className="page-sub">Catálogo de produtos</p></div>
      </div>
      <div className="empty-state">
        <div className="empty-icon">📦</div>
        <h3>Módulo Produtos em construção</h3>
        <p>Este módulo estará disponível em breve</p>
      </div>
    </div>
  );
}