export type ActivityPresentationItem = {
  action: string;
  resourceType: string;
  metadata: Record<string, unknown>;
  actorName: string | null;
  actorEmail: string | null;
};

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const resourceLabels: Record<string, string> = {
  experience: 'la experiencia',
  catalog_product: 'un producto',
  product: 'un producto',
  claim: 'un premio',
  prize: 'un premio',
  member: 'un miembro',
  asset: 'un archivo',
  channel: 'un canal',
};

function resourceLabel(resourceType: string) {
  return resourceLabels[resourceType] ?? 'un recurso del espacio';
}

export function formatActivity(item: ActivityPresentationItem) {
  const actor = item.actorName || item.actorEmail || 'Sistema';
  const name = metadataText(item.metadata, 'name') || metadataText(item.metadata, 'experienceName') || 'la experiencia';
  const prizeName = metadataText(item.metadata, 'prizeName') || 'el premio';
  const member = metadataText(item.metadata, 'name') || metadataText(item.metadata, 'email') || 'un miembro';
  const previousRole = metadataText(item.metadata, 'previousRole');
  const role = metadataText(item.metadata, 'role');
  const channelName = metadataText(item.metadata, 'channelName') || name;
  const experienceName = metadataText(item.metadata, 'experienceName') || 'una experiencia';
  switch (item.action) {
    case 'experience.created': return `${actor} creó ${name}`;
    case 'experience.updated': return `${actor} actualizó ${name}`;
    case 'experience.published': return `${actor} publicó ${name}`;
    case 'experience.unpublished': return `${actor} retiró la publicación de ${name}`;
    case 'experience.cloned': return `${actor} duplicó ${name}`;
    case 'inventory.adjusted': {
      const before = metadataNumber(item.metadata, 'before');
      const after = metadataNumber(item.metadata, 'after');
      return before === null || after === null ? `${actor} ajustó el stock de ${prizeName}` : `${actor} ajustó el stock de ${prizeName}: ${before} → ${after}`;
    }
    case 'claim.redeemed': return `${actor} canjeó ${prizeName}`;
    case 'member.created': return `${actor} agregó a ${member}`;
    case 'member.reactivated': return `${actor} reactivó a ${member}`;
    case 'member.role_changed': return previousRole && role ? `${actor} cambió el rol de ${member}: ${previousRole} → ${role}` : `${actor} actualizó el rol de ${member}`;
    case 'member.deactivated': return `${actor} revocó el acceso de ${member}`;
    case 'catalog.product.created': return `${actor} creó el producto ${name}`;
    case 'catalog.product.updated': return `${actor} actualizó el producto ${name}`;
    case 'catalog.product.archived': return `${actor} archivó el producto ${name}`;
    case 'product.created': return `${actor} creó el producto ${name}`;
    case 'product.updated': return `${actor} actualizó el producto ${name}`;
    case 'product.published': return `${actor} publicó el producto ${name}`;
    case 'product.archived': return `${actor} archivó el producto ${name}`;
    case 'product.stock.adjusted': {
      const before = metadataNumber(item.metadata, 'before');
      const after = metadataNumber(item.metadata, 'after');
      return before === null || after === null ? `${actor} ajustó el stock de ${name}` : `${actor} ajustó el stock de ${name}: ${before} → ${after}`;
    }
    case 'product.gallery.updated': {
      const operation = metadataText(item.metadata, 'operation');
      if (operation === 'added') return `${actor} agregó una imagen a la galería de ${name}`;
      if (operation === 'removed') return `${actor} quitó una imagen de la galería de ${name}`;
      if (operation === 'reordered') return `${actor} actualizó el orden de las imágenes de ${name}`;
      return `${actor} actualizó la galería de ${name}`;
    }
    case 'catalog.product.reordered': return `${actor} actualizó el orden de los productos`;
    case 'catalog.stock.adjusted': {
      const before = metadataNumber(item.metadata, 'before');
      const after = metadataNumber(item.metadata, 'after');
      return before === null || after === null ? `${actor} ajustó el stock de un producto` : `${actor} ajustó el stock del producto: ${before} → ${after}`;
    }
    case 'catalog.gallery.updated': {
      const operation = metadataText(item.metadata, 'operation');
      if (operation === 'added') return `${actor} agregó una imagen a la galería de un producto`;
      if (operation === 'removed') return `${actor} quitó una imagen de la galería de un producto`;
      if (operation === 'reordered') return `${actor} actualizó el orden de las imágenes de un producto`;
      return `${actor} actualizó la galería de un producto`;
    }
    case 'channel.created': return `${actor} registró el canal ${name}`;
    case 'channel.updated': return `${actor} actualizó el canal ${name}`;
    case 'channel.activated': return `${actor} activó el canal ${name}`;
    case 'channel.deactivated': return `${actor} desactivó el canal ${name}`;
    case 'channel.experience.linked': return `${actor} conectó ${experienceName} a ${channelName}`;
    case 'channel.experience.unlinked': return `${actor} desconectó ${experienceName} de ${channelName}`;
    case 'channel.content_profile.assigned': return `${actor} preparó el perfil de contenido de ${channelName}`;
    case 'channel.content.draft_updated': return `${actor} actualizó el borrador de contenido de ${channelName}`;
    case 'channel.content.published': return `${actor} publicó el contenido de ${channelName}`;
    default: return `${actor} registró una acción en ${resourceLabel(item.resourceType)}`;
  }
}
