'use client'

import { Checkbox, Flex, HStack, Input, NativeSelect, Spinner, Text } from '@chakra-ui/react'
import { useUrlFilters } from '@/components/search/use_url_filters'
import type { RecipeFilterOptions } from '@/models/recipe'
import type { RecipeSearch } from '@/validators/recipe'

interface RecipeFiltersProps {
  filters: RecipeSearch
  options: RecipeFilterOptions
}

function Select({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string
  value: string | number | undefined
  placeholder: string
  options: { value: string | number; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <NativeSelect.Root size="sm" width="auto" minW="40">
      <NativeSelect.Field
        aria-label={label}
        value={value === undefined ? '' : String(value)}
        onChange={(event) => onChange(event.currentTarget.value)}
        bg="bg"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  )
}

/** Search and filters of /recipes: each change goes to the URL and the list follows */
export function RecipeFilters({ filters, options }: RecipeFiltersProps) {
  const { update, updateLater, pending } = useUrlFilters()

  return (
    <Flex gap="2" wrap="wrap" align="center" mb="4">
      <Input
        type="search"
        size="sm"
        flex="1"
        minW="64"
        bg="bg"
        defaultValue={filters.q ?? ''}
        placeholder="Buscar receita, produto ou ingrediente (ex.: plank, ingot)"
        aria-label="Buscar"
        autoComplete="off"
        onChange={(event) => updateLater({ q: event.currentTarget.value.trim() })}
      />
      <Select
        label="Skill"
        value={filters.skill}
        placeholder="Todas as skills"
        options={options.skills.map((s) => ({ value: s.id, label: s.name }))}
        onChange={(value) => update({ skill: value })}
      />
      {options.stations.length > 0 && (
        <Select
          label="Estação"
          value={filters.station}
          placeholder="Todas as estações"
          options={options.stations.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(value) => update({ station: value })}
        />
      )}
      {options.tiers.length > 0 && (
        <Select
          label="Tier da estação"
          value={filters.tier}
          placeholder="Todos os tiers"
          options={options.tiers.map((tier) => ({ value: tier, label: `Estação T${tier}` }))}
          onChange={(value) => update({ tier: value })}
        />
      )}
      <Select
        label="Tipo"
        value={filters.verb}
        placeholder="Todos os tipos"
        options={options.verbs.map((verb) => ({ value: verb, label: verb }))}
        onChange={(value) => update({ verb: value })}
      />
      <Checkbox.Root
        size="sm"
        defaultChecked={filters.all ?? false}
        onCheckedChange={({ checked }) => update({ all: checked === true ? 'true' : null })}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>Incluir desmontar, recriar e embalar</Checkbox.Label>
      </Checkbox.Root>
      {pending && (
        <HStack gap="1.5" color="fg.muted">
          <Spinner size="xs" />
          <Text textStyle="sm">Buscando…</Text>
        </HStack>
      )}
    </Flex>
  )
}
