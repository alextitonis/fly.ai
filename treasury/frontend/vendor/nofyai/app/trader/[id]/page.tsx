'use client';

import { use } from 'react';
import { TraderDetailView } from '@/components/trader/TraderDetailView';

export default function TraderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div className="w-full px-6 py-6">
      <TraderDetailView traderId={id} showHeader={true} />
    </div>
  );
}
