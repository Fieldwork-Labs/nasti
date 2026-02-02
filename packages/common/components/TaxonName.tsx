interface TaxonNameProps {
  name: string
  className?: string
}

export function TaxonName({ name, className = "" }: TaxonNameProps) {
  // Parse the taxon name into parts
  const formatTaxonName = (taxonName: string) => {
    const parts: Array<{ text: string; italic: boolean }> = []

    // Match patterns in the name
    // Pattern 1: Genus species
    // Pattern 2: Genus species subsp./var./aff. infraspecies
    // Pattern 3: Genus sp. phrase name (collector details)
    // Pattern 4: Genus x hybrid

    const tokens = taxonName.trim().split(/\s+/)

    let i = 0
    while (i < tokens.length) {
      const token = tokens[i]

      // Genus (always italic, capitalized)
      if (i === 0) {
        parts.push({ text: token, italic: true })
        i++
        continue
      }

      // Rank indicators (not italic)
      if (["subsp.", "var.", "aff.", "sp."].includes(token.toLowerCase())) {
        parts.push({ text: ` ${token}`, italic: false })
        i++
        continue
      }

      // Hybrid indicator (not italic)
      if (token === "x") {
        parts.push({ text: ` ${token}`, italic: false })
        i++
        continue
      }

      // If we hit a parenthesis, everything from here is not italic (collector info)
      if (token.startsWith("(")) {
        const remainingText = tokens.slice(i).join(" ")
        parts.push({ text: ` ${remainingText}`, italic: false })
        break
      }

      // Check if this looks like a phrase name (starts with capital after "sp.")
      const prevToken = tokens[i - 1]?.toLowerCase()
      if (prevToken === "sp." && /^[A-Z]/.test(token)) {
        // This is a phrase name - not italic
        // Collect until we hit parenthesis or end
        const phraseTokens = []
        while (i < tokens.length && !tokens[i].startsWith("(")) {
          phraseTokens.push(tokens[i])
          i++
        }
        parts.push({ text: ` ${phraseTokens.join(" ")}`, italic: false })

        // Handle collector info if present
        if (i < tokens.length) {
          const remainingText = tokens.slice(i).join(" ")
          parts.push({ text: ` ${remainingText}`, italic: false })
          break
        }
        continue
      }

      // Specific epithet or infraspecific epithet (italic, lowercase)
      parts.push({ text: ` ${token}`, italic: true })
      i++
    }

    return parts
  }

  const formattedParts = formatTaxonName(name)

  return (
    <span className={className}>
      {formattedParts.map((part, index) => (
        <span key={index} className={part.italic ? "italic" : ""}>
          {part.text}
        </span>
      ))}
    </span>
  )
}
