import { useCallback, useEffect, useState } from 'react';
import { ShopAddress } from '../../types';
import { fetchShopAddresses } from '../../services/api';

// The signed-in person's saved addresses, loaded when the screen opens. `setAddresses` takes the fresh list the database
// sends back after every add / change / removal, so the screen never has to guess.
export function useAddressBook() {
  const [addresses, setAddresses] = useState<ShopAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetchShopAddresses();
    if (res.success) {
      setAddresses(res.addresses);
      setError(null);
    } else {
      setError(res.error || 'Could not load your addresses.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { addresses, setAddresses, loading, error, setError, reload };
}
