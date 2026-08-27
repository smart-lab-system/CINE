import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomEntity } from './entities/room.entity';

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
}
