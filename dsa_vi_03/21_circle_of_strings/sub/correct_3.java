

// User function Template for Java

class Solution {
    public int isCircle(String arr[]) {
        int inDegree[] = new int[26], outDegree[] = new int[26];
        int mask = 0;
        Map<Character, Set<Character>> map = new LinkedHashMap<>();
        for(String word : arr) {
            int n = word.length();
            inDegree[word.charAt(0)-'a']++;
            mask |= 1 << word.charAt(0)-'a';
            outDegree[word.charAt(n-1)-'a']++;
            mask |= 1 << word.charAt(n-1)-'a';
            map.putIfAbsent(word.charAt(0), new HashSet<>());
            map.putIfAbsent(word.charAt(n-1), new HashSet<>());
            map.get(word.charAt(0)).add(word.charAt(n-1));
            map.get(word.charAt(n-1)).add(word.charAt(0));
        }
        if(!allDegreesEqual(inDegree, outDegree))
            return 0;
        return bfs(arr[0].charAt(0), map, mask);
    }
    
    public static boolean allDegreesEqual(int inDegree[], int outDegree[]) {
        for(int i = 0; i < 26; i++)
            if(inDegree[i] != outDegree[i])
                return false;
        return true;
    }

    public static int bfs(char source, Map<Character, Set<Character>> graph, int mask) {
        Queue<Character> queue = new LinkedList<>();
        queue.add(source);
        int visited = 0;
        while(!queue.isEmpty()) {
            int size = queue.size();
            for(int i = 0; i < size; i++) {
                char node = queue.poll();
                int shift = node-'a';
                visited |= 1 << shift;
                for(char neighbor : graph.get(node))
                    if(!((visited & 1 << neighbor-'a') != 0))
                        queue.add(neighbor);
            }
        }
        return visited == mask ? 1 : 0;
    }
}