export const MINOR_RELATIONSHIPS = [
  'child',
  'sibling',
  'niece_nephew',
  'grandchild',
  'cousin',
  'other',
] as const;
export type MinorRelationship = (typeof MINOR_RELATIONSHIPS)[number];
export type MinorDraft = {
  id: string;
  fullName: string;
  age: string;
  sex: 'male' | 'female';
  relationship: MinorRelationship | '';
  relationshipDetail: string;
};

export function emptyMinor(): MinorDraft {
  return {
    id: crypto.randomUUID(),
    fullName: '',
    age: '',
    sex: 'male',
    relationship: '',
    relationshipDetail: '',
  };
}
