// ================================================================
//  notes.js — zapis notatek serwisowych
// ================================================================

import { gasPost } from './auth.js';

export async function saveNote({ token, vehicle, note }) {
  if (!vehicle) throw new Error('Wybierz pojazd');
  if (!note || note.trim() === '') throw new Error('Wpisz treść notatki');

  return await gasPost({
    action: 'saveNote',
    token,
    vehicle,
    note: note.trim()
  });
}