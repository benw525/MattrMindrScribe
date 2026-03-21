import { useContext } from 'react';
import { SharedContext } from '../contexts/SharedContext';

export function useShared() {
  const context = useContext(SharedContext);
  if (!context) {
    throw new Error('useShared must be used within SharedProvider');
  }
  return context;
}
