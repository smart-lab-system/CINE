

class Solution
{
    //Function to return the minimum cost to react at bottom
    //right cell from top left cell.
    class Edge{
        int i,j,w;
        Edge(int i,int j,int w){
            this.i = i;
            this.j = j;
            this.w = w;
        }
    }
    public int minimumCostPath(int[][] mat){
        int i=0,j=0,n=mat.length;
        PriorityQueue<Edge> pq = new PriorityQueue<>((a,b)->a.w-b.w);
        boolean visited[][] = new boolean[n][n];
        pq.offer(new Edge(0,0,mat[i][j]));
        int min_cost = 0;
        while(!pq.isEmpty()){
            Edge e = pq.poll();
            i = e.i;    j=e.j;
            if(visited[i][j] == true)
                continue;
            if(i==n-1 && j==n-1){
                return e.w;
            }
            visited[i][j] = true;
            if(i-1>=0 && visited[i-1][j]==false){
                pq.offer(new Edge(i-1,j,mat[i-1][j]+e.w));
            }
            if(j-1>=0 && visited[i][j-1]==false){
                pq.offer(new Edge(i,j-1,mat[i][j-1]+e.w));
            }
            if(i+1<n && visited[i+1][j]==false){
                pq.offer(new Edge(i+1,j,mat[i+1][j]+e.w));
            }
            if(j+1<n && visited[i][j+1]==false){
                pq.offer(new Edge(i,j+1,mat[i][j+1]+e.w));
            }
        }
        return min_cost;
    }
}