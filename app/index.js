// app/index.js  (dueño: P1) — la app abre en el Centro de despacho
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/despacho" />;
}
