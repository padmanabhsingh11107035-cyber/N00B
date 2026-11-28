import React from 'react';
import { LoadingPage } from '../Common/LoadingPages';
import { closeNoobModels, useNoobModelsOpen } from './modelsStore';

// The page pulls in the 3D engine: fetched only when someone opens it.
const NoobModelsPage = React.lazy(() => import('./NoobModelsPage'));

export const preloadNoobModels = (): void => { void import('./NoobModelsPage'); };

export const ModelsHost: React.FC = () => {
  const open = useNoobModelsOpen();
  if (!open) return null;
  return (
    <React.Suspense fallback={<LoadingPage z={210} />}>
      <NoobModelsPage onClose={closeNoobModels} />
    </React.Suspense>
  );
};
