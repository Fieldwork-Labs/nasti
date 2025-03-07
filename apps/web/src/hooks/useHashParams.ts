import { useState, useEffect } from "react"

interface HashParams {
  [key: string]: string
}

export const useHashParams = (): HashParams => {
  const [params, setParams] = useState<HashParams>({})

  useEffect(() => {
    const parseHash = () => {
      const hash = window.location.hash
      if (!hash || hash === "") {
        setParams({})
        return
      }

      // Remove the leading # and split into key-value pairs
      const hashContent = hash.substring(1)
      const pairs = hashContent.split("&")

      const parsedParams: HashParams = {}

      pairs.forEach((pair) => {
        const [key, value] = pair.split("=").map(decodeURIComponent)
        if (key && value) {
          parsedParams[key] = value
        }
      })

      setParams(parsedParams)
    }

    // Parse initial hash
    parseHash()

    // Listen for hash changes
    window.addEventListener("hashchange", parseHash)

    // Cleanup listener
    return () => {
      window.removeEventListener("hashchange", parseHash)
    }
  }, [])

  return params
}

// Usage example:
/*
const MyComponent = () => {
  const hashParams = useHashParams();
  
  useEffect(() => {
    if (hashParams.access_token) {
      console.log('Access Token:', hashParams.access_token);
      console.log('Token Type:', hashParams.token_type);
      console.log('Expires In:', hashParams.expires_in);
    }
  }, [hashParams]);

  return <div>...</div>;
};
*/
