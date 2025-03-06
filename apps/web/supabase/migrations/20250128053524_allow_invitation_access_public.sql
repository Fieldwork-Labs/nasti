-- Drop the previous function if it exists
DROP FUNCTION IF EXISTS public.get_invitation_by_token(uuid);

-- Create a function to get invitation by token
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(token_value uuid)
RETURNS invitation AS $$
DECLARE
    result invitation;
BEGIN
    SELECT *
    INTO result
    FROM invitation i
    WHERE i.token = token_value
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND i.accepted_at IS NULL
    LIMIT 1;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to public
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO public;