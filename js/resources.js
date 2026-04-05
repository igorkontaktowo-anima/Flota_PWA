// ================================================================
//  resources.js — zapis przekazania zasobów
// ================================================================

import { gasPost } from './auth.js';

export async function saveResource({ token, vehicle, clinic, items, note }) {
  if (!vehicle)               throw new Error('Wybierz pojazd');
  if (!clinic)                throw new Error('Wybierz lecznicę');
  if (!items || items.trim() === '') throw new Error('Wpisz przekazane zasoby');

  return await gasPost({
    action: 'saveResource',
    token,
    vehicle,
    clinic,
    items: items.trim(),
    note:  note ? note.trim() : ''
  });
}