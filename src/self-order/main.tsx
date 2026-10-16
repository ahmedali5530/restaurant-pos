import ReactDOM from 'react-dom/client';
import './self-order.css';
import { SelfOrderApp } from './app.tsx';

const params = new URLSearchParams(window.location.search);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <SelfOrderApp token={params.get('t') ?? ''} returningCheckoutId={params.get('checkout')} />,
);
