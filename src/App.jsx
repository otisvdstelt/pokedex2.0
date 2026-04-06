import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import startupSound from './assets/sound/startup.mp3'

const BATCH_SIZE = 60
const SEARCH_LIMIT = 48

const TYPE_FILTERS = [
  'all',
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
]

const SORT_OPTIONS = [
  { value: 'id-asc', label: 'No. asc' },
  { value: 'id-desc', label: 'No. desc' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'hp-desc', label: 'HP high' },
  { value: 'attack-desc', label: 'ATK high' },
]

const BOOT_LINES = [
  'Checking core memory...',
  'Linking Pokemon database...',
  'Calibrating scan lens...',
  'Pokedex online.',
]

const formatName = (value) =>
  value
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((piece) => piece[0].toUpperCase() + piece.slice(1))
    .join(' ')

const formatStatName = (stat) => {
  const map = {
    hp: 'HP',
    attack: 'ATK',
    defense: 'DEF',
    'special-attack': 'SpA',
    'special-defense': 'SpD',
    speed: 'SPD',
  }

  return map[stat] || stat
}

const getStatValue = (pokemon, statName) =>
  pokemon.stats?.find((entry) => entry.stat.name === statName)?.base_stat || 0

const extractEvolutionNames = (chainNode, collector = []) => {
  if (!chainNode) return collector

  collector.push(chainNode.species.name)
  chainNode.evolves_to.forEach((evolution) => extractEvolutionNames(evolution, collector))

  return collector
}

const getEnglishFlavorText = (speciesData) => {
  const englishEntry = speciesData?.flavor_text_entries?.find((entry) => entry.language.name === 'en')
  return englishEntry?.flavor_text?.replace(/\f|\n/g, ' ') || 'No Pokedex entry available yet.'
}

const getEnglishGenus = (speciesData) => {
  const englishGenus = speciesData?.genera?.find((entry) => entry.language.name === 'en')
  return englishGenus?.genus || 'Pokemon'
}

const isTypingTarget = (target) => {
  if (!target || !(target instanceof HTMLElement)) return false

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  )
}

function App() {
  const [allPokemonList, setAllPokemonList] = useState([])
  const [displayedPokemon, setDisplayedPokemon] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedType, setSelectedType] = useState('all')
  const [sortBy, setSortBy] = useState('id-asc')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState(() => {
    try {
      const stored = localStorage.getItem('pokedex-favorites')
      if (!stored) return []

      return [...new Set(JSON.parse(stored))]
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    } catch (error) {
      return []
    }
  })
  const [hydratedFavoritePokemon, setHydratedFavoritePokemon] = useState({})

  const [pokemonDetails, setPokemonDetails] = useState(null)
  const [currentSprite, setCurrentSprite] = useState('front')
  const [scanPulse, setScanPulse] = useState(false)
  const [bootPhase, setBootPhase] = useState('off')
  const [bootStep, setBootStep] = useState(-1)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [cryCooldownUntil, setCryCooldownUntil] = useState(0)
  const [cryCountdown, setCryCountdown] = useState(0)

  const searchInputRef = useRef(null)
  const scanTimeoutRef = useRef(null)
  const uiAudioRef = useRef(null)
  const startupAudioRef = useRef(null)
  const bootTimersRef = useRef([])
  const cacheRef = useRef({
    byUrl: new Map(),
    byName: new Map(),
    byId: new Map(),
  })
  const detailCacheRef = useRef(new Map())
  const isBootLocked = bootPhase !== 'ready'
  const bootProgress =
    bootPhase === 'off'
      ? 0
      : bootPhase === 'ready'
      ? 100
      : Math.max(18, Math.round(((bootStep + 1) / BOOT_LINES.length) * 100))

  useEffect(() => {
    localStorage.setItem('pokedex-favorites', JSON.stringify(favoriteIds))
  }, [favoriteIds])

  useEffect(() => {
    const audio = new Audio(startupSound)
    audio.preload = 'auto'
    audio.volume = 0.5
    startupAudioRef.current = audio

    return () => {
      audio.pause()
      audio.src = ''
    }
  }, [])

  useEffect(() => {
    if (cryCooldownUntil <= Date.now()) {
      setCryCountdown(0)
      return
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((cryCooldownUntil - Date.now()) / 1000))
      setCryCountdown(remaining)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 120)
    return () => clearInterval(interval)
  }, [cryCooldownUntil])

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
      }

      bootTimersRef.current.forEach((timer) => clearTimeout(timer))

      if (uiAudioRef.current) {
        uiAudioRef.current.close().catch(() => {})
      }

      if (startupAudioRef.current) {
        startupAudioRef.current.pause()
        startupAudioRef.current.currentTime = 0
      }
    }
  }, [])

  const playStartupSound = () => {
    try {
      if (!startupAudioRef.current) {
        startupAudioRef.current = new Audio(startupSound)
        startupAudioRef.current.preload = 'auto'
      }

      startupAudioRef.current.pause()
      startupAudioRef.current.currentTime = 0
      startupAudioRef.current.volume = 0.5
      startupAudioRef.current.play().catch(() => {})
    } catch (error) {
      // Ignore audio load/playback failures.
    }
  }

  const playUiBeep = (type = 'tap') => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return

      if (!uiAudioRef.current) {
        uiAudioRef.current = new AudioContextClass()
      }

      const ctx = uiAudioRef.current
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      const tones = {
        tap: { frequency: 920, duration: 0.04, gain: 0.028 },
        nav: { frequency: 760, duration: 0.05, gain: 0.032 },
        confirm: { frequency: 660, duration: 0.07, gain: 0.036 },
        power: { frequency: 480, duration: 0.12, gain: 0.045 },
      }

      const tone = tones[type] || tones.tap
      const now = ctx.currentTime
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(tone.frequency, now)

      gainNode.gain.setValueAtTime(0.0001, now)
      gainNode.gain.exponentialRampToValueAtTime(tone.gain, now + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration)

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.start(now)
      oscillator.stop(now + tone.duration + 0.02)
    } catch (error) {
      // Ignore audio API failures.
    }
  }

  const startBootSequence = () => {
    if (bootPhase !== 'off') return

    playStartupSound()

    const bootStartDelay = 320
    const bootStepDelay = 620
    const endDelay = bootStartDelay + BOOT_LINES.length * bootStepDelay + 620

    bootTimersRef.current.forEach((timer) => clearTimeout(timer))
    bootTimersRef.current = []

    setBootStep(-1)
    setBootPhase('booting')

    BOOT_LINES.forEach((_, index) => {
      const timer = setTimeout(() => {
        setBootStep(index)
      }, bootStartDelay + index * bootStepDelay)
      bootTimersRef.current.push(timer)
    })

    const finishTimer = setTimeout(() => {
      setBootStep(BOOT_LINES.length - 1)
      setBootPhase('ready')
    }, endDelay)

    bootTimersRef.current.push(finishTimer)
  }

  const cachePokemon = (pokemon, sourceUrl) => {
    if (!pokemon) return

    if (sourceUrl) {
      cacheRef.current.byUrl.set(sourceUrl, pokemon)
    }

    cacheRef.current.byId.set(String(pokemon.id), pokemon)
    cacheRef.current.byName.set(pokemon.name.toLowerCase(), pokemon)
  }

  const fetchPokemonByUrl = async (url) => {
    if (cacheRef.current.byUrl.has(url)) {
      return cacheRef.current.byUrl.get(url)
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('Could not fetch pokemon detail')
    }

    const pokemon = await response.json()
    cachePokemon(pokemon, url)
    return pokemon
  }

  const fetchPokemonByQuery = async (query) => {
    const normalized = String(query).toLowerCase().trim()

    if (cacheRef.current.byName.has(normalized)) {
      return cacheRef.current.byName.get(normalized)
    }

    if (cacheRef.current.byId.has(normalized)) {
      return cacheRef.current.byId.get(normalized)
    }

    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${normalized}`)
    if (!response.ok) {
      return null
    }

    const pokemon = await response.json()
    cachePokemon(pokemon)
    return pokemon
  }

  useEffect(() => {
    let isCancelled = false

    const hydrateFavoritePokemon = async () => {
      if (!favoriteIds.length) {
        setHydratedFavoritePokemon({})
        return
      }

      const cachedLookup = {}
      const missingIds = favoriteIds.filter((id) => {
        const cachedPokemon = cacheRef.current.byId.get(String(id))
        if (cachedPokemon) {
          cachedLookup[id] = cachedPokemon
          return false
        }

        return true
      })

      if (!isCancelled) {
        setHydratedFavoritePokemon((previous) => {
          const next = {}

          favoriteIds.forEach((id) => {
            if (cachedLookup[id]) {
              next[id] = cachedLookup[id]
            } else if (previous[id]) {
              next[id] = previous[id]
            }
          })

          const prevKeys = Object.keys(previous)
          const nextKeys = Object.keys(next)
          const sameLength = prevKeys.length === nextKeys.length
          const sameEntries = sameLength && nextKeys.every((key) => previous[key] === next[key])

          return sameEntries ? previous : next
        })
      }

      if (!missingIds.length) return

      const fetchedEntries = await Promise.all(
        missingIds.map(async (id) => {
          try {
            const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
            if (!response.ok) return null

            const pokemon = await response.json()
            cachePokemon(pokemon)
            return [id, pokemon]
          } catch (error) {
            return null
          }
        }),
      )

      if (isCancelled) return

      const fetchedLookup = Object.fromEntries(fetchedEntries.filter(Boolean))
      if (Object.keys(fetchedLookup).length) {
        setHydratedFavoritePokemon((previous) => {
          const next = { ...previous, ...fetchedLookup }
          const filtered = {}
          favoriteIds.forEach((id) => {
            if (next[id]) {
              filtered[id] = next[id]
            }
          })
          return filtered
        })
      }
    }

    hydrateFavoritePokemon()

    return () => {
      isCancelled = true
    }
  }, [favoriteIds])

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const listResponse = await fetch('https://pokeapi.co/api/v2/pokemon?limit=10000')
        const listData = await listResponse.json()
        setAllPokemonList(listData.results)

        const initialBatch = await Promise.all(
          listData.results.slice(0, BATCH_SIZE).map(async (entry) => {
            try {
              return await fetchPokemonByUrl(entry.url)
            } catch (error) {
              return null
            }
          }),
        )

        const validPokemon = initialBatch.filter(Boolean).sort((a, b) => a.id - b.id)
        setDisplayedPokemon(validPokemon)
        setCurrentIndex(BATCH_SIZE)
      } catch (error) {
        console.error('Error bootstrapping Pokedex:', error)
      } finally {
        setIsInitialLoading(false)
      }
    }

    bootstrap()
  }, [])

  const loadMorePokemon = async () => {
    if (isLoadingMore || currentIndex >= allPokemonList.length || searchTerm.trim()) {
      return
    }

    setIsLoadingMore(true)

    const batch = allPokemonList.slice(currentIndex, currentIndex + BATCH_SIZE)

    try {
      const newPokemon = await Promise.all(
        batch.map(async (entry) => {
          try {
            return await fetchPokemonByUrl(entry.url)
          } catch (error) {
            return null
          }
        }),
      )

      const validPokemon = newPokemon.filter(Boolean)

      setDisplayedPokemon((previous) => {
        const existing = new Set(previous.map((pokemon) => pokemon.id))
        const merged = [...previous, ...validPokemon.filter((pokemon) => !existing.has(pokemon.id))]
        return merged.sort((a, b) => a.id - b.id)
      })

      setCurrentIndex((prev) => prev + BATCH_SIZE)
    } catch (error) {
      console.error('Error loading more pokemon:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleListScroll = (event) => {
    if (searchTerm.trim() || isLoadingMore || isBootLocked) return

    const node = event.currentTarget
    const nearBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 120

    if (nearBottom) {
      loadMorePokemon()
    }
  }

  useEffect(() => {
    if (searchTerm.trim()) return

    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight
      const scrollTop = document.documentElement.scrollTop
      const clientHeight = document.documentElement.clientHeight

      if (scrollTop + clientHeight >= scrollHeight - 650) {
        loadMorePokemon()
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [searchTerm, currentIndex, isLoadingMore, allPokemonList.length])

  useEffect(() => {
    const query = searchTerm.trim().toLowerCase()

    if (!query) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    let isCancelled = false
    setIsSearching(true)

    const timer = setTimeout(async () => {
      try {
        if (/^\d+$/.test(query)) {
          const exactPokemon = await fetchPokemonByQuery(query)
          if (!isCancelled) {
            setSearchResults(exactPokemon ? [exactPokemon] : [])
          }
          return
        }

        const matchedEntries = allPokemonList
          .filter((entry) => entry.name.includes(query))
          .slice(0, SEARCH_LIMIT)

        const resultDetails = await Promise.all(
          matchedEntries.map(async (entry) => {
            try {
              return await fetchPokemonByUrl(entry.url)
            } catch (error) {
              return null
            }
          }),
        )

        if (!isCancelled) {
          setSearchResults(resultDetails.filter(Boolean).sort((a, b) => a.id - b.id))
        }
      } catch (error) {
        if (!isCancelled) {
          setSearchResults([])
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false)
        }
      }
    }, 300)

    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm, allPokemonList])

  useEffect(() => {
    const handleGlobalSearchShortcut = (event) => {
      if (isBootLocked) return

      if (event.key === '/' && document.activeElement !== searchInputRef.current) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleGlobalSearchShortcut)
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut)
  }, [isBootLocked])

  const sourcePokemon = useMemo(() => {
    if (searchTerm.trim()) {
      return searchResults
    }

    if (!showFavoritesOnly) {
      return displayedPokemon
    }

    const mergedById = new Map(displayedPokemon.map((pokemon) => [pokemon.id, pokemon]))
    Object.values(hydratedFavoritePokemon).forEach((pokemon) => {
      if (pokemon?.id) {
        mergedById.set(pokemon.id, pokemon)
      }
    })

    return [...mergedById.values()].sort((a, b) => a.id - b.id)
  }, [searchTerm, searchResults, showFavoritesOnly, displayedPokemon, hydratedFavoritePokemon])

  const favoritePokemon = useMemo(() => {
    const byId = new Map(displayedPokemon.map((pokemon) => [pokemon.id, pokemon]))
    return favoriteIds
      .map((id) => ({
        id,
        pokemon:
          byId.get(id) ||
          hydratedFavoritePokemon[id] ||
          cacheRef.current.byId.get(String(id)) ||
          null,
      }))
      .sort((a, b) => a.id - b.id)
  }, [favoriteIds, displayedPokemon, hydratedFavoritePokemon])

  const filteredPokemon = useMemo(() => {
    const favorites = new Set(favoriteIds)
    let workingSet = [...sourcePokemon]

    if (selectedType !== 'all') {
      workingSet = workingSet.filter((pokemon) =>
        pokemon.types.some((entry) => entry.type.name === selectedType),
      )
    }

    if (showFavoritesOnly) {
      workingSet = workingSet.filter((pokemon) => favorites.has(pokemon.id))
    }

    const sorted = [...workingSet]

    switch (sortBy) {
      case 'id-desc':
        sorted.sort((a, b) => b.id - a.id)
        break
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'hp-desc':
        sorted.sort((a, b) => getStatValue(b, 'hp') - getStatValue(a, 'hp'))
        break
      case 'attack-desc':
        sorted.sort((a, b) => getStatValue(b, 'attack') - getStatValue(a, 'attack'))
        break
      default:
        sorted.sort((a, b) => a.id - b.id)
    }

    return sorted
  }, [sourcePokemon, selectedType, showFavoritesOnly, favoriteIds, sortBy])

  const selectedIndex = pokemonDetails
    ? filteredPokemon.findIndex((pokemon) => pokemon.id === pokemonDetails.id)
    : -1

  const isFavorite = (pokemonId) => favoriteIds.includes(pokemonId)

  const toggleFavorite = (pokemonId) => {
    if (isBootLocked) return

    playUiBeep('confirm')

    const normalizedId = Number(pokemonId)
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) return

    setFavoriteIds((previous) =>
      previous.includes(normalizedId)
        ? previous.filter((favoriteId) => favoriteId !== normalizedId)
        : [...previous, normalizedId],
    )
  }

  const openPokemonDetails = async (pokemon) => {
    if (isBootLocked) return

    playUiBeep('nav')

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
    }

    setScanPulse(true)
    scanTimeoutRef.current = window.setTimeout(() => setScanPulse(false), 260)

    setCurrentSprite('front')

    if (detailCacheRef.current.has(pokemon.id)) {
      const cached = detailCacheRef.current.get(pokemon.id)
      setPokemonDetails({ ...pokemon, ...cached })
      return
    }

    setIsDetailLoading(true)

    try {
      const speciesResponse = await fetch(pokemon.species.url)
      const speciesData = await speciesResponse.json()

      let evolutionNames = []
      if (speciesData?.evolution_chain?.url) {
        const evolutionResponse = await fetch(speciesData.evolution_chain.url)
        const evolutionData = await evolutionResponse.json()
        evolutionNames = [...new Set(extractEvolutionNames(evolutionData.chain))]
      }

      const detailData = {
        speciesData,
        flavorText: getEnglishFlavorText(speciesData),
        genus: getEnglishGenus(speciesData),
        evolutionNames,
      }

      detailCacheRef.current.set(pokemon.id, detailData)
      setPokemonDetails({ ...pokemon, ...detailData })
    } catch (error) {
      console.error('Error loading detail panel:', error)
      const fallbackData = {
        flavorText: 'No Pokedex entry available yet.',
        genus: 'Pokemon',
        evolutionNames: [],
      }
      detailCacheRef.current.set(pokemon.id, fallbackData)
      setPokemonDetails({ ...pokemon, ...fallbackData })
    } finally {
      setIsDetailLoading(false)
    }
  }

  const browseDetail = (direction) => {
    if (isBootLocked) return
    if (selectedIndex < 0 || !filteredPokemon.length) return

    playUiBeep('nav')

    const nextIndex = (selectedIndex + direction + filteredPokemon.length) % filteredPokemon.length
    const nextPokemon = filteredPokemon[nextIndex]
    openPokemonDetails(nextPokemon)
  }

  useEffect(() => {
    if (!pokemonDetails || isBootLocked) return

    const onKeydown = (event) => {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        browseDetail(-1)
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        browseDetail(1)
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        toggleFavorite(pokemonDetails.id)
      }
    }

    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [pokemonDetails, selectedIndex, filteredPokemon, isBootLocked])

  const handleRandomPokemon = () => {
    if (isBootLocked) return
    if (!filteredPokemon.length) return

    playUiBeep('tap')

    const randomPokemon = filteredPokemon[Math.floor(Math.random() * filteredPokemon.length)]
    openPokemonDetails(randomPokemon)
  }

  const clearFilters = () => {
    if (isBootLocked) return

    playUiBeep('tap')

    setSearchTerm('')
    setSelectedType('all')
    setSortBy('id-asc')
    setShowFavoritesOnly(false)
  }

  const handleSearchInputClick = () => {
    if (isBootLocked) return

    playUiBeep('tap')
  }

  const handleTypeChange = (event) => {
    if (isBootLocked) return

    playUiBeep('tap')
    setSelectedType(event.target.value)
  }

  const handleSortChange = (event) => {
    if (isBootLocked) return

    playUiBeep('tap')
    setSortBy(event.target.value)
  }

  const toggleFavoritesOnlyFilter = () => {
    if (isBootLocked) return

    playUiBeep('tap')
    setShowFavoritesOnly((previous) => !previous)
  }

  const handleLoadMoreClick = () => {
    if (isBootLocked) return

    playUiBeep('tap')
    loadMorePokemon()
  }

  const handleSpriteChange = (sprite) => {
    if (isBootLocked) return

    playUiBeep('tap')
    setCurrentSprite(sprite)
  }

  const playCry = () => {
    if (isBootLocked) return

    const cooldownActive = Date.now() < cryCooldownUntil
    if (cooldownActive) return

    const cryUrl = pokemonDetails?.cries?.latest || pokemonDetails?.cries?.legacy
    if (!cryUrl) return

    setCryCooldownUntil(Date.now() + 2000)

    const audio = new Audio(cryUrl)
    audio.volume = 0.12
    audio.play().catch(() => {})
  }

  const moveSet = useMemo(() => {
    if (!pokemonDetails?.moves) return []

    const parsedMoves = pokemonDetails.moves.map((moveEntry) => {
      const levelDetails = [...(moveEntry.version_group_details || [])]
        .filter((detail) => detail.move_learn_method.name === 'level-up')
        .sort((a, b) => a.level_learned_at - b.level_learned_at)

      const firstLevelDetail = levelDetails[0] || null

      return {
        name: formatName(moveEntry.move.name),
        level: firstLevelDetail ? firstLevelDetail.level_learned_at : null,
      }
    })

    return parsedMoves
      .sort((a, b) => {
        if (a.level === null && b.level === null) return a.name.localeCompare(b.name)
        if (a.level === null) return 1
        if (b.level === null) return -1
        if (a.level !== b.level) return a.level - b.level
        return a.name.localeCompare(b.name)
      })
      .slice(0, 14)
  }, [pokemonDetails])

  const detailSprite =
    currentSprite === 'shiny'
      ? pokemonDetails?.sprites?.front_shiny || pokemonDetails?.sprites?.front_default
      : currentSprite === 'back'
      ? pokemonDetails?.sprites?.back_default || pokemonDetails?.sprites?.front_default
      : pokemonDetails?.sprites?.front_default || pokemonDetails?.sprites?.back_default

  return (
    <div className={`pokedex-app ${scanPulse ? 'scan-pulse' : ''} phase-${bootPhase}`}>
      <div className="pokedex-stage">
        <div className="gameboy-shell">
          <header className="gameboy-top">
            <div className="device-lights" aria-hidden="true">
              <span className="main-light"></span>
              <span className="small-light red"></span>
              <span className="small-light yellow"></span>
              <span className="small-light green"></span>
            </div>

            <h1>Pokedex</h1>

            <div className="top-actions">
              <button type="button" className="tiny-btn" onClick={handleRandomPokemon} disabled={isBootLocked}>
                Random
              </button>
              <button type="button" className="tiny-btn" onClick={clearFilters} disabled={isBootLocked}>
                Reset
              </button>
            </div>
          </header>

          <section className="gameboy-screen">
          <div className="screen-toolbar">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search name or number"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onClick={handleSearchInputClick}
              className="search-input"
              disabled={isBootLocked}
            />

            <select
              value={selectedType}
              onChange={handleTypeChange}
              disabled={isBootLocked}
            >
              {TYPE_FILTERS.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All types' : formatName(type)}
                </option>
              ))}
            </select>

            <select value={sortBy} onChange={handleSortChange} disabled={isBootLocked}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`tiny-btn ${showFavoritesOnly ? 'active' : ''}`}
              onClick={toggleFavoritesOnlyFilter}
              disabled={isBootLocked}
            >
              {showFavoritesOnly ? 'Favorites ON' : 'Favorites OFF'}
            </button>
          </div>

          <div className="screen-stats">
            <span>Loaded: {displayedPokemon.length}</span>
            <span>Visible: {filteredPokemon.length}</span>
            <span>Fav: {favoriteIds.length}</span>
            <span>Keys: /, &larr;/&rarr;, F</span>
          </div>

          {(isInitialLoading || isSearching) && (
            <div className="screen-note">Loading pokedex records...</div>
          )}

          {!isInitialLoading && !isSearching && filteredPokemon.length === 0 && (
            <div className="screen-note">No matching Pokemon found.</div>
          )}

          <div className="screen-content">
            <section className="list-pane">
              {favoriteIds.length > 0 && (
                <div className="favorite-overview">
                  <span>Favorites:</span>
                  <div className="favorite-overview-list">
                    {favoritePokemon.map((favoritePokemonItem) => (
                      <button
                        key={favoritePokemonItem.id}
                        type="button"
                        className="favorite-overview-chip"
                        onClick={() => {
                          if (!favoritePokemonItem.pokemon) return
                          openPokemonDetails(favoritePokemonItem.pokemon)
                        }}
                        disabled={isBootLocked || !favoritePokemonItem.pokemon}
                      >
                        #{String(favoritePokemonItem.id).padStart(4, '0')}{' '}
                        {favoritePokemonItem.pokemon
                          ? formatName(favoritePokemonItem.pokemon.name)
                          : 'Loading...'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pokemon-list" onScroll={handleListScroll}>
                {filteredPokemon.map((pokemon) => {
                  const active = pokemonDetails?.id === pokemon.id
                  const listSprite = pokemon.sprites?.front_default || pokemon.sprites?.back_default || null

                  return (
                    <button
                      key={pokemon.id}
                      type="button"
                      className={`pokemon-list-item ${active ? 'active' : ''}`}
                      onClick={() => openPokemonDetails(pokemon)}
                      disabled={isBootLocked}
                    >
                      {listSprite ? (
                        <img
                          src={listSprite}
                          alt={pokemon.name}
                          className="pixelated-sprite"
                          loading="lazy"
                        />
                      ) : (
                        <div className="sprite-fallback">N/A</div>
                      )}

                      <div className="list-meta">
                        <strong>#{String(pokemon.id).padStart(4, '0')}</strong>
                        <span>{formatName(pokemon.name)}</span>
                        <small>
                          {pokemon.types.map((entry) => formatName(entry.type.name)).join(' / ')}
                        </small>
                      </div>

                      <span
                        className={`fav-indicator ${isFavorite(pokemon.id) ? 'on' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleFavorite(pokemon.id)
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            toggleFavorite(pokemon.id)
                          }
                        }}
                        aria-label={`Toggle favorite for ${pokemon.name}`}
                      >
                        F
                      </span>
                    </button>
                  )
                })}
              </div>

              {isLoadingMore && !searchTerm.trim() && (
                <div className="screen-note">Loading more records...</div>
              )}

              {!searchTerm.trim() && currentIndex < allPokemonList.length && !isLoadingMore && (
                <button
                  type="button"
                  className="tiny-btn load-more-btn"
                  onClick={handleLoadMoreClick}
                  disabled={isBootLocked}
                >
                  Load More
                </button>
              )}
            </section>

            <section className="detail-pane">
              {!pokemonDetails && <div className="screen-note">Select a Pokemon to view data.</div>}

              {isDetailLoading && <div className="screen-note">Loading entry...</div>}

              {!isDetailLoading && pokemonDetails && (
                <div className="detail-shell">
                  <div className="detail-head">
                    <div>
                      <strong>#{String(pokemonDetails.id).padStart(4, '0')}</strong>
                      <h2>{formatName(pokemonDetails.name)}</h2>
                      <p>{pokemonDetails.genus}</p>
                      <p className="pokemon-type-line">
                        {pokemonDetails.types.map((entry) => formatName(entry.type.name)).join(' / ')}
                      </p>
                    </div>
                    <div className="browse-controls">
                      <button
                        type="button"
                        className="tiny-btn"
                        onClick={() => browseDetail(-1)}
                        disabled={isBootLocked}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        className="tiny-btn"
                        onClick={() => browseDetail(1)}
                        disabled={isBootLocked}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <div className="sprite-box">
                    {detailSprite ? (
                      <img src={detailSprite} alt={pokemonDetails.name} className="detail-artwork pixelated-sprite" />
                    ) : (
                      <div className="screen-note">No sprite available.</div>
                    )}
                  </div>

                  <div className="detail-actions">
                    <button
                      type="button"
                      className={`tiny-btn ${currentSprite === 'front' ? 'active' : ''}`}
                      onClick={() => handleSpriteChange('front')}
                      disabled={isBootLocked}
                    >
                      Front
                    </button>
                    <button
                      type="button"
                      className={`tiny-btn ${currentSprite === 'back' ? 'active' : ''}`}
                      onClick={() => handleSpriteChange('back')}
                      disabled={isBootLocked}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className={`tiny-btn ${currentSprite === 'shiny' ? 'active' : ''}`}
                      onClick={() => handleSpriteChange('shiny')}
                      disabled={isBootLocked}
                    >
                      Shiny
                    </button>
                    <button
                      type="button"
                      className="tiny-btn"
                      onClick={playCry}
                      disabled={isBootLocked || cryCountdown > 0}
                    >
                      {cryCountdown > 0 ? `Cry (${cryCountdown})` : 'Cry'}
                    </button>
                    <button
                      type="button"
                      className="tiny-btn"
                      onClick={() => toggleFavorite(pokemonDetails.id)}
                      disabled={isBootLocked}
                    >
                      {isFavorite(pokemonDetails.id) ? 'Unfav' : 'Fav'}
                    </button>
                  </div>

                  <p className="dex-entry">{pokemonDetails.flavorText}</p>

                  <div className="detail-grid">
                    <div>
                      <span>Height</span>
                      <strong>{(pokemonDetails.height / 10).toFixed(1)}m</strong>
                    </div>
                    <div>
                      <span>Weight</span>
                      <strong>{(pokemonDetails.weight / 10).toFixed(1)}kg</strong>
                    </div>
                    <div>
                      <span>Base XP</span>
                      <strong>{pokemonDetails.base_experience || 0}</strong>
                    </div>
                    <div>
                      <span>Habitat</span>
                      <strong>
                        {pokemonDetails.speciesData?.habitat
                          ? formatName(pokemonDetails.speciesData.habitat.name)
                          : 'Unknown'}
                      </strong>
                    </div>
                  </div>

                  <div className="detail-section-title">Attack Set</div>

                  <div className="stats-stack">
                    {pokemonDetails.stats.map((stat) => {
                      const percent = Math.min(100, Math.round((stat.base_stat / 255) * 100))

                      return (
                        <div key={stat.stat.name} className="stat-row">
                          <span>{formatStatName(stat.stat.name)}</span>
                          <div className="bar-track">
                            <div className="bar-fill" style={{ width: `${percent}%` }}></div>
                          </div>
                          <strong>{stat.base_stat}</strong>
                        </div>
                      )
                    })}
                  </div>

                  <div className="detail-section-title">Moves</div>

                  <div className="moves-list">
                    {moveSet.map((move) => (
                      <span key={move.name}>
                        {move.name}
                        {move.level !== null ? ` Lv${move.level}` : ''}
                      </span>
                    ))}
                  </div>

                  <div className="evolution-row">
                    <span>Evolution:</span>
                    <strong>
                      {pokemonDetails.evolutionNames?.length
                        ? pokemonDetails.evolutionNames.map(formatName).join(' -> ')
                        : 'None'}
                    </strong>
                  </div>
                </div>
              )}
            </section>
          </div>

            {bootPhase === 'off' && (
              <div className="power-overlay">
                <button type="button" className="power-on-btn" onClick={startBootSequence}>
                  Power On
                </button>
              </div>
            )}

            {bootPhase === 'booting' && (
              <div className={`startup-overlay ${bootPhase}`}>
                <div className="startup-core">
                  <p className="startup-title">Pokedex Startup</p>

                  <div className="startup-leds" aria-hidden="true">
                    <span className={bootProgress > 20 ? 'on' : ''}></span>
                    <span className={bootProgress > 55 ? 'on' : ''}></span>
                    <span className={bootProgress > 85 ? 'on' : ''}></span>
                  </div>

                  <div className="startup-lines">
                    {BOOT_LINES.slice(0, Math.max(bootStep + 1, 0)).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>

                  <div className="startup-progress">
                    <span style={{ width: `${bootProgress}%` }}></span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
