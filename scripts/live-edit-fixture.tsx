import {createRoot} from 'react-dom/client';
import {LiveEditor} from '../src/renderer/src/LiveEditor';
import '../src/renderer/src/style.css';
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<main className="panel"><header className="top"><strong className="logo">Slipper</strong><span className="where">共同編集の検証</span></header><LiveEditor presentationId={params.get('deck')!} pageId="live_page" /></main>);
