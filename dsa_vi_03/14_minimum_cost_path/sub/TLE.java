
class Pair{ int v, c; Pair(int v, int c) { this.v=v; this.c=c; } }
class Solution{ 
    public int minimumCostPath(int[][] grid){
        int c = 0, n = grid.length; 
        ArrayList <ArrayList<Pair>> arr = new ArrayList<>();
        for(int i=0;i<n*n;i++) arr.add(new ArrayList<>());
        for(int i=0;i<n;i++){
            for(int j=0;j<n;j++){
                int top = 0, left = 0, right = 0, down=0;
                int cost = grid[i][j];
                if(i>0) top = grid[i-1][j];
                if(i<n-1) down = grid[i+1][j];
                if(j>0) left = grid[i][j-1];
                if(j<n-1) right = grid[i][j+1];
                if(top != 0)  arr.get(c).add(new Pair(c-n, top)); 
                if(down != 0) arr.get(c).add(new Pair(c+n, down)); 
                if(right != 0) arr.get(c).add(new Pair(c+1, right)); 
                if(left != 0) arr.get(c).add(new Pair(c-1, left)); 
                c++;
            } 
        }
        PriorityQueue <Pair>pq = new PriorityQueue<>((a,b)->a.c-b.c);
        boolean vis[] = new boolean[n*n];
        int res[] = new int[n*n]; Arrays.fill(res, Integer.MAX_VALUE);
        res[0] = grid[0][0]; pq.add( new Pair(0, grid[0][0]) );
        while( !pq.isEmpty() ){
            int s = pq.poll().v;
            if(!vis[s]){
                vis[s] = true;
                for(Pair obj: arr.get(s)){
                    int d = obj.v, cost = obj.c;  
                    if(!vis[d] && res[s]+cost < res[d]){
                        res[d] = res[s] + cost;
                        pq.add( new Pair(d, res[d]) );
                    }
                }
            }
        }  
        return res[n*n-1];
    }
}