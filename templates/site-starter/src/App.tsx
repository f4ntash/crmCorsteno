import { useCallback, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { SiteShell } from './components/SiteShell';
import { HomePage } from './pages/HomePage';
import { ProductsPage } from './pages/ProductsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { NotFoundState } from './components/PageStates';

export function App() {
  const [siteName, setSiteName] = useState('');
  const onSiteName = useCallback((name: string) => setSiteName(name), []);
  return <SiteShell siteName={siteName}><Routes><Route path="/" element={<HomePage onSiteName={onSiteName} />} /><Route path="/productos" element={<ProductsPage onSiteName={onSiteName} />} /><Route path="/productos/:productKey" element={<ProductDetailPage onSiteName={onSiteName} />} /><Route path="*" element={<NotFoundState />} /></Routes></SiteShell>;
}
