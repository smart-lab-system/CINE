

// function Template for Java

/* linked list node class:

class Node {
    int data;
    Node next;
    Node(int value) {
        this.value = value;
    }
}

*/

class Solution {
    Node reverseList(Node head) {
        // code here
        if(head == null || head.next == null) return head;
        
        Node prev = null;
        Node cur = head;
        
        while(cur != null){
            Node front = cur.next;
            cur.next = prev;
            prev = temp;
            temp = front;
        }
        return prev;
    }
}



     