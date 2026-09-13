import { depression } from './depression';
import { anxiety } from './anxiety';
import { schizophrenia } from './schizophrenia';
import { adhd } from './adhd';
import type { Disorder } from '../types';

export const disorders: Disorder[] = [depression, anxiety, schizophrenia, adhd];

export function getDisorderById(id: string): Disorder | undefined {
  return disorders.find(d => d.id === id);
}

export function searchDisorders(query: string): Disorder[] {
  const q = query.toLowerCase().trim();
  if (!q) return disorders;
  return disorders.filter(
    d =>
      d.name.toLowerCase().includes(q) ||
      d.shortDescription.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q)
  );
}
