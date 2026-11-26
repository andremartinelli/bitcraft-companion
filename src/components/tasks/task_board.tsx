'use client'

import { Badge, Box, Heading, HStack, Stack, Text } from '@chakra-ui/react'
import { ItemChip } from '@/components/items/item_chip'
import { formatNumber } from '@/lib/format'
import type { BoardTask, TravelerBoard } from '@/services/tasks/task_board'

/** One task: each item it asks for, and how many the account has */
function TaskRow({ task }: { task: BoardTask }) {
  return (
    <HStack gap="3" wrap="wrap" py="1.5" borderTopWidth="1px" _first={{ borderTopWidth: 0 }}>
      {task.lines.map((line) => {
        const missing = line.quantity - line.have
        return (
          <HStack key={line.item.id} gap="2">
            <ItemChip item={line.item} quantity={line.quantity} />
            <Text textStyle="sm" color={missing > 0 ? 'fg.muted' : 'fg.success'}>
              {missing > 0
                ? `você tem ${formatNumber(line.have)} · faltam ${formatNumber(missing)}`
                : `✅ você tem ${formatNumber(line.have)}`}
            </Text>
          </HStack>
        )
      })}
      <HStack gap="1.5" ml="auto">
        {task.completed && (
          <Badge size="sm" colorPalette="green">
            Concluída
          </Badge>
        )}
        <Badge size="sm" variant="outline" colorPalette="gray">
          T{task.tier}
        </Badge>
      </HStack>
    </HStack>
  )
}

function TravelerCard({
  traveler,
  tasks,
  notice = false,
}: {
  traveler: TravelerBoard
  tasks: BoardTask[]
  /** Say when the tier comes from the level, not from quests */
  notice?: boolean
}) {
  return (
    <Box p="3" borderWidth="1px" rounded="l2" bg="bg">
      <HStack gap="2" wrap="wrap" mb="1">
        <Heading as="h3" size="sm">
          {traveler.name}
        </Heading>
        <Text textStyle="sm" color="fg.muted">
          {traveler.skill} nível {traveler.level} · T{traveler.tier}
        </Text>
      </HStack>
      {notice && !traveler.tierFromQuests && (
        <Text textStyle="xs" color="fg.muted" mb="1">
          As tasks de cada criatura exigem a quest dela.
        </Text>
      )}
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </Box>
  )
}

/**
 * The tasks page: on top the tasks the character has now; below, every task
 * of its tier in each traveler's skill
 */
export function TaskBoard({ travelers, read }: { travelers: TravelerBoard[]; read: boolean }) {
  const withCurrent = travelers.filter((traveler) => traveler.current.length > 0)
  return (
    <Stack gap="8">
      <Stack gap="3">
        <Heading as="h2" size="md">
          Suas tasks agora
        </Heading>
        {withCurrent.length > 0 ? (
          withCurrent.map((traveler) => (
            <TravelerCard key={traveler.name} traveler={traveler} tasks={traveler.current} />
          ))
        ) : (
          <Text textStyle="sm" color="fg.muted">
            {read
              ? 'Nenhuma task no momento. O jogo renova as tasks a cada 4 horas.'
              : 'O seu personagem ainda não foi lido: as tasks aparecem depois da sincronização.'}
          </Text>
        )}
      </Stack>
      <Stack gap="3">
        <Heading as="h2" size="md">
          Podem aparecer
        </Heading>
        <Text textStyle="sm" color="fg.muted">
          Todas as tasks do tier que as suas quests liberaram em cada viajante (a quest de cada tier
          pede um nível na habilidade dele). Os viajantes também pedem, às vezes, tasks de tiers
          abaixo.
        </Text>
        {travelers.map((traveler) => (
          <TravelerCard
            key={traveler.name}
            traveler={traveler}
            tasks={traveler.possible}
            notice
          />
        ))}
      </Stack>
    </Stack>
  )
}
