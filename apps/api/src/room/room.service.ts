import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomEntity } from './entities/room.entity';
import { CreateRoomDto, UpdateRoomDto } from '../course/dto/course.dto';

@Injectable()
export class RoomService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly rooms: Repository<RoomEntity>,
  ) {}

  // Unpaginated on purpose: rooms are a small, near-static reference list
  // (bounded by the number of physical labs the department has), not a
  // growing dataset like accounts or exam sessions — a dropdown/select
  // source, not a table that needs server-side paging.
  async findAll(): Promise<RoomEntity[]> {
    return this.rooms.find({ order: { name: 'ASC' } });
  }

  /**
   * Rooms are university-wide facilities, not departmental property: two
   * departments book the same lab in different slots, so scoping a room to
   * one of them would make that impossible. Any Trưởng khoa may maintain
   * the list; `uq_room_name` keeps the shared namespace honest.
   */
  async create(dto: CreateRoomDto): Promise<RoomEntity> {
    return this.rooms.save(this.rooms.create(dto));
  }

  async update(id: string, dto: UpdateRoomDto): Promise<RoomEntity> {
    const room = await this.findOrFail(id);
    Object.assign(room, dto);
    return this.rooms.save(room);
  }

  async remove(id: string): Promise<void> {
    const room = await this.findOrFail(id);
    // exam_session.room_id is ON DELETE RESTRICT: a room with sessions
    // scheduled in it cannot be deleted out from under them.
    await this.rooms.remove(room);
  }

  private async findOrFail(id: string): Promise<RoomEntity> {
    const room = await this.rooms.findOne({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }
}
