import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [allPokemonList, setAllPokemonList] = useState([])
  const [displayedPokemon, setDisplayedPokemon] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedPokemon, setSelectedPokemon] = useState(null)
  const [pokemonDetails, setPokemonDetails] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const BATCH_SIZE = 50

  // Fetch all Pokemon names/URLs on mount
  useEffect(() => {
    const fetchAllPokemonList = async () => {
      try {
        const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=10000')
        const data = await response.json()
        setAllPokemonList(data.results)
        
        // Initially load first batch of Pokemon
        const initialResults = await Promise.all(
          data.results.slice(0, BATCH_SIZE).map(async (p) => {
            try {
              const res = await fetch(p.url)
              if (res.ok) {
                return res.json()
              }
              return null
            } catch (error) {
              return null
            }
          })
        )
        const initialPokemon = initialResults.filter(p => p !== null)
        
        setDisplayedPokemon(initialPokemon.sort((a, b) => a.id - b.id))
        setCurrentIndex(BATCH_SIZE)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching Pokemon:', error)
        setLoading(false)
      }
    }

    fetchAllPokemonList()
  }, [])

  // Handle search
  useEffect(() => {
    const searchPokemon = async () => {
      if (!searchTerm) {
        setSearchResults([])
        return
      }

      setLoading(true)

      // Check if search is a number
      if (!isNaN(searchTerm) && searchTerm.trim() !== '') {
        try {
          const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${searchTerm}`)
          if (response.ok) {
            const pokemon = await response.json()
            setSearchResults([pokemon])
          } else {
            setSearchResults([])
          }
        } catch (error) {
          setSearchResults([])
        }
      } else {
        // Search by name
        const filtered = allPokemonList.filter((p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase())
        ).slice(0, 50) // Limit to 50 results

        try {
          const results = await Promise.all(
            filtered.map(async (p) => {
              try {
                const res = await fetch(p.url)
                if (res.ok) {
                  return res.json()
                }
                return null
              } catch (error) {
                return null
              }
            })
          )
          setSearchResults(results.filter(p => p !== null).sort((a, b) => a.id - b.id))
        } catch (error) {
          setSearchResults([])
        }
      }

      setLoading(false)
    }

    const timer = setTimeout(searchPokemon, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, allPokemonList])

  // Load more Pokemon
  const loadMorePokemon = async () => {
    if (loadingMore || currentIndex >= allPokemonList.length) return

    setLoadingMore(true)
    
    const nextBatch = allPokemonList.slice(currentIndex, currentIndex + BATCH_SIZE)
    
    try {
      const results = await Promise.all(
        nextBatch.map(async (p) => {
          try {
            const res = await fetch(p.url)
            if (res.ok) {
              return res.json()
            }
            return null
          } catch (error) {
            return null
          }
        })
      )
      
      const validPokemon = results.filter(p => p !== null)
      setDisplayedPokemon(prev => {
        const existingIds = new Set(prev.map(p => p.id))
        const newPokemon = validPokemon.filter(p => !existingIds.has(p.id))
        return [...prev, ...newPokemon].sort((a, b) => a.id - b.id)
      })
      setCurrentIndex(prev => prev + BATCH_SIZE)
    } catch (error) {
      console.error('Error loading more Pokemon:', error)
    }
    
    setLoadingMore(false)
  }

  // Infinite scroll
  useEffect(() => {
    if (searchTerm) return // Don't load more when searching

    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight
      const scrollTop = document.documentElement.scrollTop
      const clientHeight = document.documentElement.clientHeight

      if (scrollTop + clientHeight >= scrollHeight - 500) {
        loadMorePokemon()
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [currentIndex, loadingMore, searchTerm, allPokemonList])

  const pokemonToDisplay = searchTerm ? searchResults : displayedPokemon

  const handlePokemonClick = async (pokemon) => {
    setSelectedPokemon(pokemon)
    setLoading(true)
    
    try {
      // Fetch species data for additional info
      const speciesResponse = await fetch(pokemon.species.url)
      const speciesData = await speciesResponse.json()
      
      setPokemonDetails({
        ...pokemon,
        speciesData
      })
      setLoading(false)
    } catch (error) {
      console.error('Error fetching Pokemon details:', error)
      setPokemonDetails(pokemon)
      setLoading(false)
    }
  }

  const handleBackClick = () => {
    setSelectedPokemon(null)
    setPokemonDetails(null)
  }

  // Detail View Component
  if (selectedPokemon && pokemonDetails) {
    return (
      <div className="pokedex-container">
        <div className="pokedex-header">
          <div className="header-lights">
            <div className="big-light"></div>
            <div className="small-lights">
              <div className="small-light red"></div>
              <div className="small-light yellow"></div>
              <div className="small-light green"></div>
            </div>
          </div>
          <h1>Pokédex</h1>
        </div>

        <button className="back-button" onClick={handleBackClick}>
          ← Back to List
        </button>

        {loading ? (
          <div className="loading">Loading Details...</div>
        ) : (
          <div className="detail-view">
            <div className="detail-header">
              <div className="detail-id">#{pokemonDetails.id.toString().padStart(3, '0')}</div>
              <h2 className="detail-name">{pokemonDetails.name}</h2>
              <div className="detail-types">
                {pokemonDetails.types.map((type) => (
                  <span 
                    key={type.type.name} 
                    className={`type-badge type-${type.type.name}`}
                  >
                    {type.type.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="detail-content">
              <div className="detail-images">
                {pokemonDetails.sprites.front_default && (
                  <div className="sprite-container">
                    <img 
                      src={pokemonDetails.sprites.front_default} 
                      alt={`${pokemonDetails.name} front`}
                      className="detail-sprite"
                    />
                  </div>
                )}
                {pokemonDetails.sprites.back_default && (
                  <div className="sprite-container">
                    <img 
                      src={pokemonDetails.sprites.back_default} 
                      alt={`${pokemonDetails.name} back`}
                      className="detail-sprite"
                    />
                  </div>
                )}
                {pokemonDetails.sprites.front_shiny && (
                  <div className="sprite-container shiny">
                    <img 
                      src={pokemonDetails.sprites.front_shiny} 
                      alt={`${pokemonDetails.name} shiny`}
                      className="detail-sprite"
                    />
                    <span className="shiny-label">✨ Shiny</span>
                  </div>
                )}
              </div>

              <div className="detail-info">
                <div className="info-section">
                  <h3>Base Stats</h3>
                  <div className="stats-container">
                    {pokemonDetails.stats.map((stat) => (
                      <div key={stat.stat.name} className="stat-row">
                        <span className="stat-name">{stat.stat.name}</span>
                        <div className="stat-bar-container">
                          <div 
                            className="stat-bar" 
                            style={{width: `${(stat.base_stat / 255) * 100}%`}}
                          ></div>
                        </div>
                        <span className="stat-value">{stat.base_stat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="info-section">
                  <h3>Abilities</h3>
                  <div className="abilities-container">
                    {pokemonDetails.abilities.map((ability) => (
                      <div key={ability.ability.name} className="ability-item">
                        <span className="ability-name">{ability.ability.name}</span>
                        {ability.is_hidden && <span className="hidden-badge">Hidden</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="info-section">
                  <h3>Physical Traits</h3>
                  <div className="traits-container">
                    <div className="trait-item">
                      <span className="trait-label">Height:</span>
                      <span className="trait-value">{(pokemonDetails.height / 10).toFixed(1)} m</span>
                    </div>
                    <div className="trait-item">
                      <span className="trait-label">Weight:</span>
                      <span className="trait-value">{(pokemonDetails.weight / 10).toFixed(1)} kg</span>
                    </div>
                    <div className="trait-item">
                      <span className="trait-label">Base Experience:</span>
                      <span className="trait-value">{pokemonDetails.base_experience}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pokedex-container">
      <div className="pokedex-header">
        <div className="header-lights">
          <div className="big-light"></div>
          <div className="small-lights">
            <div className="small-light red"></div>
            <div className="small-light yellow"></div>
            <div className="small-light green"></div>
          </div>
        </div>
        <h1>Pokédex</h1>
      </div>

      <div className="search-container">
        <input
          type="text"
          placeholder="Search by name or number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        {!searchTerm && (
          <div className="pokemon-counter">
            Loaded: {displayedPokemon.length} / {allPokemonList.length} Pokémon
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading Pokémon...</div>
      ) : (
        <div className="pokemon-grid">
          {pokemonToDisplay.map((p) => (
            <div 
              key={p.id} 
              className="pokemon-card"
              onClick={() => handlePokemonClick(p)}
            >
              <div className="pokemon-id">#{p.id.toString().padStart(3, '0')}</div>
              <div className="pokemon-image">
                {p.sprites?.front_default ? (
                  <img 
                    src={p.sprites.front_default} 
                    alt={p.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="no-sprite">No Image</div>
                )}
              </div>
              <h3 className="pokemon-name">{p.name}</h3>
              <div className="pokemon-types">
                {p.types.map((type) => (
                  <span 
                    key={type.type.name} 
                    className={`type-badge type-${type.type.name}`}
                  >
                    {type.type.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {loadingMore && !searchTerm && (
        <div className="loading-more">Loading more Pokémon...</div>
      )}

      {!loading && pokemonToDisplay.length === 0 && (
        <div className="no-results">No Pokémon found!</div>
      )}
    </div>
  )
}

export default App
