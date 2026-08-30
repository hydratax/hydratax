-- Fulfillment after Stripe payment (logged-in practice member or service role)

CREATE POLICY "practice members update ch requests"
  ON public.companies_house_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.practice_members pm
      WHERE pm.practice_id = companies_house_requests.practice_id
        AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.practice_members pm
      WHERE pm.practice_id = companies_house_requests.practice_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "cs_filings_insert_member"
  ON public.confirmation_statement_filings
  FOR INSERT
  WITH CHECK (
    practice_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.practice_members m
      WHERE m.practice_id = confirmation_statement_filings.practice_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "cs_filings_update_member"
  ON public.confirmation_statement_filings
  FOR UPDATE
  USING (
    practice_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.practice_members m
      WHERE m.practice_id = confirmation_statement_filings.practice_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    practice_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.practice_members m
      WHERE m.practice_id = confirmation_statement_filings.practice_id
        AND m.user_id = auth.uid()
    )
  );
