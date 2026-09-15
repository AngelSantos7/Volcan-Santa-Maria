import { useCallback, useEffect, useState } from 'react';
import { getVisitErrorMessage } from './visit-errors';
import { getGroupVisitDetails, getMyActiveGroupVisit } from './visit-service';
import type { GroupVisitDetails } from './visit-types';

const REFRESH_INTERVAL_MS = 10_000;

export function useActiveGroupVisit(currentUserId: string) {
  const [details, setDetails] = useState<GroupVisitDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const openVisit = useCallback(
    async (visitId: string) => {
      const nextDetails = await getGroupVisitDetails(visitId);
      const ownMembership = nextDetails.participants.find(
        (participant) => participant.userId === currentUserId
      );
      const membershipIsActive =
        ownMembership?.memberStatus === 'active' ||
        ownMembership?.memberStatus === 'returning_early' ||
        (ownMembership?.memberRole === 'leader' &&
          ownMembership.memberStatus === 'returned_early');

      if (
        nextDetails.status === 'completed' ||
        (nextDetails.status !== 'cancelled' && membershipIsActive)
      ) {
        setDetails(nextDetails);
      } else {
        setDetails(null);
      }

      setError(null);
    },
    [currentUserId]
  );

  const refreshActiveVisit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const activeVisit = await getMyActiveGroupVisit();

      if (activeVisit) {
        await openVisit(activeVisit.visit_id);
      } else {
        setDetails(null);
      }
    } catch (loadError) {
      setError(getVisitErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [openVisit]);

  const refreshDetails = useCallback(async () => {
    if (
      !details ||
      (details.status !== 'forming' && details.status !== 'in_progress')
    ) {
      return;
    }

    try {
      await openVisit(details.visitId);
    } catch (loadError) {
      setError(getVisitErrorMessage(loadError));
    }
  }, [details, openVisit]);

  useEffect(() => {
    let active = true;

    void getMyActiveGroupVisit()
      .then((activeVisit) =>
        activeVisit ? getGroupVisitDetails(activeVisit.visit_id) : null
      )
      .then((activeDetails) => {
        if (!active) return;

        setDetails(activeDetails);
        setError(null);
      })
      .catch((loadError) => {
        if (active) setError(getVisitErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!details) return;

    const intervalId = window.setInterval(() => {
      void refreshDetails();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [details, refreshDetails]);

  return {
    details,
    loading,
    error,
    openVisit,
    refreshActiveVisit,
    refreshDetails,
    clearVisit: () => {
      setDetails(null);
      setError(null);
    },
  };
}
