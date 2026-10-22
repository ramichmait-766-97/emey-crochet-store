export function normalizeIdentity(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Match older/admin-created documents as well as fixed seed IDs. Ambiguity must
// stop the seed, never silently choose a product or create another duplicate.
export function matchProduct(product, documents) {
  const matches = documents.filter(
    ({ id, data }) =>
      normalizeIdentity(id) === normalizeIdentity(product.id) ||
      (data.slug && normalizeIdentity(data.slug) === normalizeIdentity(product.slug)) ||
      (data.name && normalizeIdentity(data.name) === normalizeIdentity(product.name)),
  );
  if (matches.length > 1) {
    throw new Error(
      `Duplicate catalog identities for ${product.slug}: ${matches.map((x) => x.id).join(', ')}. Resolve these documents before seeding.`,
    );
  }
  const match = matches[0];
  if (
    match &&
    normalizeIdentity(match.id) === normalizeIdentity(product.id) &&
    match.data.slug &&
    normalizeIdentity(match.data.slug) !== normalizeIdentity(product.slug)
  ) {
    throw new Error(
      `ID ${product.id} belongs to another slug (${match.data.slug}); refusing to overwrite its image.`,
    );
  }
  return match;
}
